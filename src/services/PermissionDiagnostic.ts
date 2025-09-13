import { Client, Guild, GuildChannel, TextChannel, PermissionsBitField, Role, GuildMember } from 'discord.js';
import { BotConfig } from '../types';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

export interface PermissionTraceStep {
  source: 'server_owner' | 'administrator' | 'everyone_guild' | 'role' | 'everyone_channel' | 'role_channel' | 'user_channel';
  name: string;
  permissions: string[];
  denies: string[];
  grants: string[];
  isBlocking: boolean;
  roleId?: string;
  userId?: string;
}

export interface ChannelPermissionAnalysis {
  channelId: string;
  channelName: string;
  channelType: string;
  hasAccess: boolean;
  requiredPermissions: PermissionCheck[];
  permissionTrace: PermissionTraceStep[];
  blockingFactors: string[];
  missingPermissions: string[];
}

export interface PermissionCheck {
  permission: keyof typeof PermissionsBitField.Flags;
  required: boolean;
  granted: boolean;
  source: string;
}

export interface DiagnosticReport {
  timestamp: Date;
  guildId: string;
  guildName: string;
  botId: string;
  botDisplayName: string;
  guildPermissions: PermissionCheck[];
  channelAnalyses: ChannelPermissionAnalysis[];
  overallStatus: 'healthy' | 'warnings' | 'critical';
  summary: {
    totalChannels: number;
    accessibleChannels: number;
    blockedChannels: number;
    criticalIssues: string[];
    warnings: string[];
  };
}

export class PermissionDiagnostic {
  private readonly REQUIRED_GUILD_PERMISSIONS: (keyof typeof PermissionsBitField.Flags)[] = [
    'ViewChannel',
    'SendMessages',
    'UseExternalEmojis'
  ];

  private readonly REQUIRED_ANALYSIS_CHANNEL_PERMISSIONS: (keyof typeof PermissionsBitField.Flags)[] = [
    'ViewChannel',
    'ReadMessageHistory'
  ];

  private readonly REQUIRED_GENERAL_CHANNEL_PERMISSIONS: (keyof typeof PermissionsBitField.Flags)[] = [
    'ViewChannel',
    'SendMessages',
    'EmbedLinks',
    'UseExternalEmojis',
    'ReadMessageHistory'
  ];

  private readonly DIAGNOSTICS_DIR = path.join(process.cwd(), 'diagnostics');

  constructor() {
    this.ensureDiagnosticsDirectory();
  }

  public async runStartupDiagnostics(client: Client, config: BotConfig): Promise<DiagnosticReport | null> {
    const startTime = Date.now();
    Logger.info('🔍 Starting permission diagnostics...');

    try {
      const guild = await this.getGuild(client, config);
      if (!guild) {
        Logger.warn('Could not access guild for permission diagnostics');
        return null;
      }

      const botMember = await this.getBotMember(guild, client);
      if (!botMember) {
        Logger.warn('Could not find bot member in guild');
        return null;
      }

      const report = await this.generateDiagnosticReport(guild, botMember, config);
      await this.logDiagnosticResults(report);
      await this.exportDiagnosticData(report);

      const duration = Date.now() - startTime;
      Logger.info(`✅ Permission diagnostics completed in ${duration}ms`);

      return report;
    } catch (error) {
      Logger.error('Permission diagnostic failed (non-blocking):', error);
      return null;
    }
  }

  private async generateDiagnosticReport(
    guild: Guild, 
    botMember: GuildMember, 
    config: BotConfig
  ): Promise<DiagnosticReport> {
    const guildPermissions = await this.analyzeGuildPermissions(guild, botMember);
    const channelAnalyses = await this.analyzeChannelPermissions(guild, botMember, config);

    const report: DiagnosticReport = {
      timestamp: new Date(),
      guildId: guild.id,
      guildName: guild.name,
      botId: botMember.id,
      botDisplayName: botMember.displayName,
      guildPermissions,
      channelAnalyses,
      overallStatus: this.determineOverallStatus(guildPermissions, channelAnalyses),
      summary: this.generateSummary(channelAnalyses)
    };

    return report;
  }

  private async analyzeGuildPermissions(guild: Guild, botMember: GuildMember): Promise<PermissionCheck[]> {
    const permissions: PermissionCheck[] = [];
    const memberPermissions = botMember.permissions;

    for (const permission of this.REQUIRED_GUILD_PERMISSIONS) {
      const hasPermission = memberPermissions.has(PermissionsBitField.Flags[permission]);
      permissions.push({
        permission,
        required: true,
        granted: hasPermission,
        source: this.getPermissionSource(guild, botMember, permission)
      });
    }

    return permissions;
  }

  private async analyzeChannelPermissions(
    guild: Guild, 
    botMember: GuildMember, 
    config: BotConfig
  ): Promise<ChannelPermissionAnalysis[]> {
    const analyses: ChannelPermissionAnalysis[] = [];
    const allChannelIds = [...config.analysisChannels, config.generalNoticesChannel];

    for (const channelId of allChannelIds) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          analyses.push(this.createChannelNotFoundAnalysis(channelId));
          continue;
        }

        const analysis = await this.analyzeIndividualChannel(channel as GuildChannel, botMember, config);
        analyses.push(analysis);
      } catch (error) {
        Logger.error(`Error analyzing channel ${channelId}:`, error);
        analyses.push(this.createChannelErrorAnalysis(channelId, error));
      }
    }

    return analyses;
  }

  private async analyzeIndividualChannel(
    channel: GuildChannel, 
    botMember: GuildMember,
    config: BotConfig
  ): Promise<ChannelPermissionAnalysis> {
    const permissions = channel.permissionsFor(botMember);
    const requiredPermissions: PermissionCheck[] = [];
    const blockingFactors: string[] = [];
    const missingPermissions: string[] = [];

    const isAnalysisChannel = config.analysisChannels.includes(channel.id);
    const isGeneralChannel = config.generalNoticesChannel === channel.id;
    
    // Choose appropriate permission requirements based on channel type
    const channelPermissions = isAnalysisChannel 
      ? this.REQUIRED_ANALYSIS_CHANNEL_PERMISSIONS
      : this.REQUIRED_GENERAL_CHANNEL_PERMISSIONS;

    for (const permission of channelPermissions) {
      const hasPermission = permissions?.has(PermissionsBitField.Flags[permission]) ?? false;
      const check: PermissionCheck = {
        permission,
        required: true,
        granted: hasPermission,
        source: hasPermission ? this.getChannelPermissionSource(channel, botMember, permission) : 'none'
      };

      requiredPermissions.push(check);

      if (!hasPermission) {
        missingPermissions.push(permission);
      }
    }

    const permissionTrace = await this.tracePermissionResolution(channel, botMember);

    // Identify blocking factors based on channel type
    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
      blockingFactors.push('Cannot view channel');
    }
    
    // Only check SendMessages for general channel (where bot needs to reply)
    if (isGeneralChannel && !permissions?.has(PermissionsBitField.Flags.SendMessages)) {
      blockingFactors.push('Cannot send messages');
    }
    
    if (isGeneralChannel && !permissions?.has(PermissionsBitField.Flags.UseExternalEmojis)) {
      blockingFactors.push('Cannot use external emojis for buttons');
    }

    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: isAnalysisChannel ? 'analysis' : isGeneralChannel ? 'general' : 'unknown',
      hasAccess: permissions?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
      requiredPermissions,
      permissionTrace,
      blockingFactors,
      missingPermissions
    };
  }

  private async tracePermissionResolution(channel: GuildChannel, botMember: GuildMember): Promise<PermissionTraceStep[]> {
    const trace: PermissionTraceStep[] = [];
    const guild = channel.guild;

    // Step 1: Server Owner check
    if (guild.ownerId === botMember.id) {
      trace.push({
        source: 'server_owner',
        name: 'Server Owner',
        permissions: ['ALL_PERMISSIONS'],
        denies: [],
        grants: ['ALL_PERMISSIONS'],
        isBlocking: false
      });
      return trace;
    }

    // Step 2: Administrator permission check
    if (botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const adminRoles = botMember.roles.cache.filter(role => 
        role.permissions.has(PermissionsBitField.Flags.Administrator)
      );
      
      trace.push({
        source: 'administrator',
        name: `Administrator (via ${adminRoles.map(r => r.name).join(', ')})`,
        permissions: ['ALL_PERMISSIONS'],
        denies: [],
        grants: ['ALL_PERMISSIONS'],
        isBlocking: false
      });
      return trace;
    }

    // Step 3: @everyone guild permissions
    const everyoneRole = guild.roles.everyone;
    const everyonePermissions = everyoneRole.permissions.toArray();
    const everyoneDenies: string[] = [];
    
    trace.push({
      source: 'everyone_guild',
      name: '@everyone (Guild)',
      permissions: everyonePermissions,
      denies: everyoneDenies,
      grants: everyonePermissions,
      isBlocking: false
    });

    // Step 4: Role permissions (excluding @everyone)
    const memberRoles = botMember.roles.cache.filter(role => role.id !== guild.roles.everyone.id);
    
    for (const [roleId, role] of memberRoles) {
      const rolePermissions = role.permissions.toArray();
      trace.push({
        source: 'role',
        name: role.name,
        permissions: rolePermissions,
        denies: [],
        grants: rolePermissions,
        isBlocking: false,
        roleId: roleId
      });
    }

    // Step 5: Channel @everyone overrides
    const everyoneOverrides = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (everyoneOverrides) {
      const allows = everyoneOverrides.allow.toArray();
      const denies = everyoneOverrides.deny.toArray();
      
      trace.push({
        source: 'everyone_channel',
        name: '@everyone (Channel Override)',
        permissions: [...allows, ...denies],
        denies: denies,
        grants: allows,
        isBlocking: denies.length > 0
      });
    }

    // Step 6: Channel role overrides
    for (const [roleId, role] of memberRoles) {
      const roleOverrides = channel.permissionOverwrites.cache.get(roleId);
      if (roleOverrides) {
        const allows = roleOverrides.allow.toArray();
        const denies = roleOverrides.deny.toArray();
        
        trace.push({
          source: 'role_channel',
          name: `${role.name} (Channel Override)`,
          permissions: [...allows, ...denies],
          denies: denies,
          grants: allows,
          isBlocking: denies.length > 0,
          roleId: roleId
        });
      }
    }

    // Step 7: User-specific channel overrides
    const userOverrides = channel.permissionOverwrites.cache.get(botMember.id);
    if (userOverrides) {
      const allows = userOverrides.allow.toArray();
      const denies = userOverrides.deny.toArray();
      
      trace.push({
        source: 'user_channel',
        name: `${botMember.displayName} (User Override)`,
        permissions: [...allows, ...denies],
        denies: denies,
        grants: allows,
        isBlocking: denies.length > 0,
        userId: botMember.id
      });
    }

    return trace;
  }

  private getPermissionSource(guild: Guild, botMember: GuildMember, permission: keyof typeof PermissionsBitField.Flags): string {
    if (guild.ownerId === botMember.id) return 'server_owner';
    if (botMember.permissions.has(PermissionsBitField.Flags.Administrator)) return 'administrator';
    
    const memberRoles = botMember.roles.cache.filter(role => 
      role.permissions.has(PermissionsBitField.Flags[permission])
    );
    
    if (memberRoles.size > 0) {
      return `role: ${memberRoles.map(r => r.name).join(', ')}`;
    }
    
    if (guild.roles.everyone.permissions.has(PermissionsBitField.Flags[permission])) {
      return '@everyone';
    }
    
    return 'unknown';
  }

  private getChannelPermissionSource(channel: GuildChannel, botMember: GuildMember, permission: keyof typeof PermissionsBitField.Flags): string {
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has(PermissionsBitField.Flags[permission])) return 'none';
    
    // Check user override first
    const userOverride = channel.permissionOverwrites.cache.get(botMember.id);
    if (userOverride && userOverride.allow.has(PermissionsBitField.Flags[permission])) {
      return 'user_override';
    }
    
    // Check role overrides
    const memberRoles = botMember.roles.cache;
    for (const [roleId, role] of memberRoles) {
      const roleOverride = channel.permissionOverwrites.cache.get(roleId);
      if (roleOverride && roleOverride.allow.has(PermissionsBitField.Flags[permission])) {
        return `role_override: ${role.name}`;
      }
    }
    
    // Fall back to guild permissions
    return this.getPermissionSource(channel.guild, botMember, permission);
  }

  private async getGuild(client: Client, config: BotConfig): Promise<Guild | null> {
    try {
      // Try to find guild from any configured channel
      const allChannelIds = [...config.analysisChannels, config.generalNoticesChannel];
      
      for (const channelId of allChannelIds) {
        try {
          const channel = await client.channels.fetch(channelId);
          if (channel && 'guild' in channel && channel.guild) {
            return channel.guild;
          }
        } catch (error) {
          // Continue to next channel
        }
      }
      
      return null;
    } catch (error) {
      Logger.error('Error finding guild:', error);
      return null;
    }
  }

  private async getBotMember(guild: Guild, client: Client): Promise<GuildMember | null> {
    try {
      if (!client.user) return null;
      return await guild.members.fetch(client.user.id);
    } catch (error) {
      Logger.error('Error fetching bot member:', error);
      return null;
    }
  }

  private createChannelNotFoundAnalysis(channelId: string): ChannelPermissionAnalysis {
    return {
      channelId,
      channelName: 'CHANNEL_NOT_FOUND',
      channelType: 'unknown',
      hasAccess: false,
      requiredPermissions: [],
      permissionTrace: [],
      blockingFactors: ['Channel not found or not accessible'],
      missingPermissions: ['ViewChannel']
    };
  }

  private createChannelErrorAnalysis(channelId: string, error: any): ChannelPermissionAnalysis {
    return {
      channelId,
      channelName: 'ERROR',
      channelType: 'unknown', 
      hasAccess: false,
      requiredPermissions: [],
      permissionTrace: [],
      blockingFactors: [`Error analyzing channel: ${error.message}`],
      missingPermissions: ['unknown']
    };
  }

  private determineOverallStatus(
    guildPermissions: PermissionCheck[], 
    channelAnalyses: ChannelPermissionAnalysis[]
  ): 'healthy' | 'warnings' | 'critical' {
    const criticalIssues = channelAnalyses.filter(c => c.blockingFactors.length > 0 || !c.hasAccess);
    const missingGuildPermissions = guildPermissions.filter(p => p.required && !p.granted);
    
    if (criticalIssues.length > 0 || missingGuildPermissions.length > 0) {
      return 'critical';
    }
    
    const warnings = channelAnalyses.filter(c => c.missingPermissions.length > 0);
    if (warnings.length > 0) {
      return 'warnings';
    }
    
    return 'healthy';
  }

  private generateSummary(channelAnalyses: ChannelPermissionAnalysis[]) {
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    
    channelAnalyses.forEach(analysis => {
      if (analysis.blockingFactors.length > 0) {
        criticalIssues.push(`${analysis.channelName}: ${analysis.blockingFactors.join(', ')}`);
      }
      if (analysis.missingPermissions.length > 0) {
        warnings.push(`${analysis.channelName}: Missing ${analysis.missingPermissions.join(', ')}`);
      }
    });
    
    return {
      totalChannels: channelAnalyses.length,
      accessibleChannels: channelAnalyses.filter(c => c.hasAccess).length,
      blockedChannels: channelAnalyses.filter(c => !c.hasAccess).length,
      criticalIssues,
      warnings
    };
  }

  private async logDiagnosticResults(report: DiagnosticReport): Promise<void> {
    const statusIcon = report.overallStatus === 'healthy' ? '✅' : 
                      report.overallStatus === 'warnings' ? '⚠️' : '❌';
    
    Logger.info(`${statusIcon} Permission Status: ${report.overallStatus.toUpperCase()}`);
    Logger.info(`📊 Guild: ${report.guildName} (${report.guildId})`);
    Logger.info(`🤖 Bot: ${report.botDisplayName} (${report.botId})`);
    Logger.info(`📁 Channels: ${report.summary.accessibleChannels}/${report.summary.totalChannels} accessible`);

    if (report.summary.criticalIssues.length > 0) {
      Logger.error('❌ CRITICAL ISSUES:');
      report.summary.criticalIssues.forEach(issue => Logger.error(`  • ${issue}`));
    }

    if (report.summary.warnings.length > 0) {
      Logger.warn('⚠️ WARNINGS:');
      report.summary.warnings.forEach(warning => Logger.warn(`  • ${warning}`));
    }

    // Detailed permission trace logging
    report.channelAnalyses.forEach(channel => {
      if (channel.blockingFactors.length > 0 || channel.missingPermissions.length > 0) {
        Logger.debug(`\n🔍 Channel: ${channel.channelName} (${channel.channelId})`);
        Logger.debug(`📍 Type: ${channel.channelType}, Access: ${channel.hasAccess ? '✅' : '❌'}`);
        
        if (channel.blockingFactors.length > 0) {
          Logger.debug('🚫 Blocking Factors:');
          channel.blockingFactors.forEach(factor => Logger.debug(`  • ${factor}`));
        }
        
        if (channel.permissionTrace.length > 0) {
          Logger.debug('🔗 Permission Resolution Trace:');
          channel.permissionTrace.forEach((step, index) => {
            const stepIcon = step.isBlocking ? '🚫' : step.grants.length > 0 ? '✅' : '➡️';
            Logger.debug(`  ${index + 1}. ${stepIcon} ${step.source}: ${step.name}`);
            if (step.grants.length > 0) {
              Logger.debug(`     Grants: ${step.grants.join(', ')}`);
            }
            if (step.denies.length > 0) {
              Logger.debug(`     Denies: ${step.denies.join(', ')}`);
            }
          });
        }
      }
    });
  }

  private async exportDiagnosticData(report: DiagnosticReport): Promise<void> {
    try {
      const timestamp = report.timestamp.toISOString().replace(/[:.]/g, '-');
      const filename = `permission-diagnostic-${timestamp}.json`;
      const filepath = path.join(this.DIAGNOSTICS_DIR, filename);
      
      const exportData = {
        ...report,
        generatedBy: 'TradersMind Discord Bot - Permission Diagnostic System',
        instructions: {
          reproduction: 'Use this data to reproduce the permission configuration locally',
          channelIds: 'Channel IDs are included for direct Discord access',
          permissionTrace: 'Step-by-step permission resolution for debugging'
        }
      };
      
      await fs.promises.writeFile(filepath, JSON.stringify(exportData, null, 2));
      Logger.info(`📝 Diagnostic data exported to: ${filepath}`);
      
      // Also create a latest.json for easy access
      const latestPath = path.join(this.DIAGNOSTICS_DIR, 'latest.json');
      await fs.promises.writeFile(latestPath, JSON.stringify(exportData, null, 2));
      
    } catch (error) {
      Logger.error('Failed to export diagnostic data:', error);
    }
  }

  private ensureDiagnosticsDirectory(): void {
    try {
      if (!fs.existsSync(this.DIAGNOSTICS_DIR)) {
        fs.mkdirSync(this.DIAGNOSTICS_DIR, { recursive: true });
      }
    } catch (error) {
      Logger.error('Failed to create diagnostics directory:', error);
    }
  }

  public async detectPermissionChanges(
    currentReport: DiagnosticReport,
    previousReport: DiagnosticReport
  ): Promise<string[]> {
    const changes: string[] = [];
    
    if (currentReport.overallStatus !== previousReport.overallStatus) {
      changes.push(`Overall status changed: ${previousReport.overallStatus} → ${currentReport.overallStatus}`);
    }
    
    // Compare channel access
    currentReport.channelAnalyses.forEach(current => {
      const previous = previousReport.channelAnalyses.find(p => p.channelId === current.channelId);
      if (previous) {
        if (current.hasAccess !== previous.hasAccess) {
          changes.push(`${current.channelName}: Access ${previous.hasAccess ? 'lost' : 'gained'}`);
        }
        
        const newBlocking = current.blockingFactors.filter(f => !previous.blockingFactors.includes(f));
        const resolvedBlocking = previous.blockingFactors.filter(f => !current.blockingFactors.includes(f));
        
        newBlocking.forEach(factor => changes.push(`${current.channelName}: New blocking factor - ${factor}`));
        resolvedBlocking.forEach(factor => changes.push(`${current.channelName}: Resolved blocking factor - ${factor}`));
      }
    });
    
    return changes;
  }
}