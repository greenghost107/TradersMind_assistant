import { test, expect } from '@playwright/test';
import { PermissionDiagnostic, DiagnosticReport } from '../src/services/PermissionDiagnostic';
import { BotConfig } from '../src/types';

test.describe('Permission Diagnostic', () => {
  let permissionDiagnostic: PermissionDiagnostic;

  test.beforeEach(() => {
    permissionDiagnostic = new PermissionDiagnostic();
  });

  test('should correctly handle different permission requirements for analysis vs general channels', async () => {
    // This test simulates the real scenario where:
    // - Analysis channels only have read permissions (no SendMessages)
    // - General channel has write permissions but no AttachFiles
    // - Bot works fine, but diagnostic shows false positives
    
    const config: BotConfig = {
      analysisChannels: ['111111111', '222222222'], // data-channel-1, data-channel-2-long
      discussionChannels: [],
      generalNoticesChannel: '333333333', // stam
      guildId: '999999999'
    };

    // Mock guild
    const mockGuild = {
      id: '999999999',
      name: 'Test Server',
      ownerId: 'owner123',
      roles: {
        everyone: {
          id: '999999999',
          permissions: {
            has: (permission: any) => {
              // @everyone has basic read permissions
              const basicPermissions = ['ViewChannel', 'ReadMessageHistory'];
              return basicPermissions.includes(permission.toString());
            },
            toArray: () => ['ViewChannel', 'ReadMessageHistory']
          }
        }
      },
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === '111111111') {
            return createMockAnalysisChannel('111111111', 'data-channel-1');
          } else if (channelId === '222222222') {
            return createMockAnalysisChannel('222222222', 'data-channel-2-long');
          } else if (channelId === '333333333') {
            return createMockGeneralChannel('333333333', 'stam');
          }
          throw new Error('Channel not found');
        }
      }
    };

    // Mock bot member
    const mockBotMember = {
      id: 'bot123',
      displayName: 'TestBot',
      permissions: {
        has: (permission: any) => {
          // Bot has basic permissions but missing UseExternalEmojis
          if (permission === 1024n || permission.toString() === '1024') return true; // ViewChannel
          if (permission === 65536n || permission.toString() === '65536') return true; // ReadMessageHistory  
          if (permission === 2048n || permission.toString() === '2048') return true; // SendMessages
          if (permission === 16384n || permission.toString() === '16384') return true; // EmbedLinks
          if (permission === 262144n || permission.toString() === '262144') return false; // UseExternalEmojis - MISSING
          return false;
        }
      },
      roles: {
        cache: (() => {
          const roleMap = new Map([
            ['bot_role_id', {
              id: 'bot_role_id',
              name: 'Bot Role',
              permissions: {
                has: (permission: any) => {
                  const rolePermissions = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks'];
                  return rolePermissions.includes(permission.toString());
                },
                toArray: () => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks']
              }
            }]
          ]);
          
          // Add Discord Collection-like methods
          (roleMap as any).filter = function(predicate: (role: any) => boolean) {
            const results = new Map();
            for (const [key, value] of this) {
              if (predicate(value)) {
                results.set(key, value);
              }
            }
            // Add map method
            (results as any).map = function(mapper: (role: any) => any) {
              const mappedResults = [];
              for (const [key, value] of this) {
                mappedResults.push(mapper(value));
              }
              return mappedResults;
            };
            return results;
          };
          
          return roleMap;
        })()
      }
    };

    // Mock client
    const mockClient = {
      user: { id: 'bot123', tag: 'TestBot#1234' },
      channels: {
        fetch: async (channelId: string) => {
          return mockGuild.channels.fetch(channelId);
        }
      }
    };

    // Generate diagnostic report
    const report = await (permissionDiagnostic as any).generateDiagnosticReport(
      mockGuild, 
      mockBotMember, 
      config
    );

    // With the fixes, this test should now demonstrate the correct behavior:
    // 1. Analysis channels should NOT show "Cannot send messages" as blocking (they only need read permissions)
    // 2. General channel should show "Missing UseExternalEmojis" as a blocking factor (it needs write permissions)
    // 3. AttachFiles should no longer be required anywhere

    const analysisChannel1 = report.channelAnalyses.find((c: any) => c.channelId === '111111111');
    const analysisChannel2 = report.channelAnalyses.find((c: any) => c.channelId === '222222222');
    const generalChannel = report.channelAnalyses.find((c: any) => c.channelId === '333333333');

    // Analysis channels should NOT have SendMessages blocking factors (they only need read access):
    expect(analysisChannel1?.blockingFactors).not.toContain('Cannot send messages');
    expect(analysisChannel2?.blockingFactors).not.toContain('Cannot send messages');
    
    // General channel should have UseExternalEmojis blocking factor (it needs this for buttons):
    expect(generalChannel?.blockingFactors).toContain('Cannot use external emojis for buttons');
    
    // AttachFiles should no longer be required anywhere:
    expect(analysisChannel1?.missingPermissions).not.toContain('AttachFiles');
    expect(analysisChannel2?.missingPermissions).not.toContain('AttachFiles');
    expect(generalChannel?.missingPermissions).not.toContain('AttachFiles');
    
    // Validate that the fixes worked correctly:
    
    // Overall status should be critical only due to missing UseExternalEmojis in general channel:
    expect(report.overallStatus).toBe('critical');
    expect(report.summary.criticalIssues.length).toBe(1);
    expect(report.summary.criticalIssues).toEqual([
      expect.stringContaining('Cannot use external emojis for buttons')
    ]);
  });

  test('should correctly identify healthy permissions after fix', async () => {
    // This test will pass after we fix the permission requirements
    // It represents the correct expected behavior
    
    const config: BotConfig = {
      analysisChannels: ['111111111', '222222222'],
      discussionChannels: [],
      generalNoticesChannel: '333333333',
      guildId: '999999999'
    };

    // Same mock setup as above, but we'll expect different results after the fix

    const mockGuild = {
      id: '999999999',
      name: 'Test Server',
      ownerId: 'owner123',
      roles: {
        everyone: {
          id: '999999999',
          permissions: {
            has: (permission: any) => {
              const basicPermissions = ['ViewChannel', 'ReadMessageHistory'];
              return basicPermissions.includes(permission.toString());
            },
            toArray: () => ['ViewChannel', 'ReadMessageHistory']
          }
        }
      },
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === '111111111') {
            return createMockAnalysisChannel('111111111', 'data-channel-1');
          } else if (channelId === '222222222') {
            return createMockAnalysisChannel('222222222', 'data-channel-2-long');
          } else if (channelId === '333333333') {
            return createMockGeneralChannelWithFullPermissions('333333333', 'stam');
          }
          throw new Error('Channel not found');
        }
      }
    };

    const mockBotMember = {
      id: 'bot123',
      displayName: 'TestBot',
      permissions: {
        has: (permission: any) => {
          // Bot member has all necessary guild permissions
          if (permission === 1024n || permission.toString() === '1024') return true; // ViewChannel
          if (permission === 65536n || permission.toString() === '65536') return true; // ReadMessageHistory  
          if (permission === 2048n || permission.toString() === '2048') return true; // SendMessages
          if (permission === 16384n || permission.toString() === '16384') return true; // EmbedLinks
          if (permission === 262144n || permission.toString() === '262144') return true; // UseExternalEmojis
          return false;
        }
      },
      roles: {
        cache: (() => {
          const roleMap = new Map([
            ['bot_role_id', {
              id: 'bot_role_id',
              name: 'Bot Role',
              permissions: {
                has: (permission: any) => {
                  const rolePermissions = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'UseExternalEmojis'];
                  return rolePermissions.includes(permission.toString());
                },
                toArray: () => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'UseExternalEmojis']
              }
            }]
          ]);
          
          // Add Discord Collection-like methods
          (roleMap as any).filter = function(predicate: (role: any) => boolean) {
            const results = new Map();
            for (const [key, value] of this) {
              if (predicate(value)) {
                results.set(key, value);
              }
            }
            // Add map method
            (results as any).map = function(mapper: (role: any) => any) {
              const mappedResults = [];
              for (const [key, value] of this) {
                mappedResults.push(mapper(value));
              }
              return mappedResults;
            };
            return results;
          };
          
          return roleMap;
        })()
      }
    };

    const mockClient = {
      user: { id: 'bot123', tag: 'TestBot#1234' },
      channels: {
        fetch: async (channelId: string) => {
          return mockGuild.channels.fetch(channelId);
        }
      }
    };

    const report = await (permissionDiagnostic as any).generateDiagnosticReport(
      mockGuild, 
      mockBotMember, 
      config
    );

    // This test demonstrates the healthy scenario after our fixes:
    
    // After fix, this should show healthy status:
    expect(report.overallStatus).toBe('healthy');
    expect(report.summary.criticalIssues.length).toBe(0);
    
    // Analysis channels should NOT have SendMessages blocking factors:
    const analysisChannel1 = report.channelAnalyses.find((c: any) => c.channelId === '111111111');
    const analysisChannel2 = report.channelAnalyses.find((c: any) => c.channelId === '222222222');
    
    expect(analysisChannel1?.blockingFactors).not.toContain('Cannot send messages');
    expect(analysisChannel2?.blockingFactors).not.toContain('Cannot send messages');
    
    // General channel should NOT require AttachFiles:
    const generalChannel = report.channelAnalyses.find((c: any) => c.channelId === '333333333');
    expect(generalChannel?.missingPermissions).not.toContain('AttachFiles');
  });
});

// Helper functions to create mock channels
function createMockAnalysisChannel(channelId: string, channelName: string) {
  return {
    id: channelId,
    name: channelName,
    guild: { 
      id: '999999999',
      roles: {
        everyone: {
          id: '999999999',
          permissions: {
            has: (permission: any) => ['ViewChannel', 'ReadMessageHistory'].includes(permission.toString()),
            toArray: () => ['ViewChannel', 'ReadMessageHistory']
          }
        }
      }
    },
    isTextBased: () => true,
    permissionsFor: (member: any) => ({
      has: (permission: any) => {
        // Analysis channels: Bot has read permissions but NOT SendMessages
        // Mock the PermissionsBitField.Flags check
        if (permission === 1024n || permission.toString() === '1024') return true; // ViewChannel
        if (permission === 65536n || permission.toString() === '65536') return true; // ReadMessageHistory
        return false; // Deny all other permissions like SendMessages
      }
    }),
    permissionOverwrites: {
      cache: new Map() // No overrides
    }
  };
}

function createMockGeneralChannel(channelId: string, channelName: string) {
  return {
    id: channelId,
    name: channelName,
    guild: { 
      id: '999999999',
      roles: {
        everyone: {
          id: '999999999',
          permissions: {
            has: (permission: any) => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks'].includes(permission.toString()),
            toArray: () => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks']
          }
        }
      }
    },
    isTextBased: () => true,
    permissionsFor: (member: any) => ({
      has: (permission: any) => {
        // General channel: Bot has most permissions but missing UseExternalEmojis
        if (permission === 1024n || permission.toString() === '1024') return true; // ViewChannel
        if (permission === 65536n || permission.toString() === '65536') return true; // ReadMessageHistory
        if (permission === 2048n || permission.toString() === '2048') return true; // SendMessages
        if (permission === 16384n || permission.toString() === '16384') return true; // EmbedLinks
        if (permission === 262144n || permission.toString() === '262144') return false; // UseExternalEmojis - MISSING
        return false; // Deny all other permissions
      }
    }),
    permissionOverwrites: {
      cache: new Map() // No overrides
    }
  };
}

function createMockGeneralChannelWithFullPermissions(channelId: string, channelName: string) {
  return {
    id: channelId,
    name: channelName,
    guild: { 
      id: '999999999',
      roles: {
        everyone: {
          id: '999999999',
          permissions: {
            has: (permission: any) => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'UseExternalEmojis'].includes(permission.toString()),
            toArray: () => ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'UseExternalEmojis']
          }
        }
      }
    },
    isTextBased: () => true,
    permissionsFor: (member: any) => ({
      has: (permission: any) => {
        // General channel: Bot has all necessary permissions
        if (permission === 1024n || permission.toString() === '1024') return true; // ViewChannel
        if (permission === 65536n || permission.toString() === '65536') return true; // ReadMessageHistory
        if (permission === 2048n || permission.toString() === '2048') return true; // SendMessages
        if (permission === 16384n || permission.toString() === '16384') return true; // EmbedLinks
        if (permission === 262144n || permission.toString() === '262144') return true; // UseExternalEmojis
        return false; // Deny all other permissions
      }
    }),
    permissionOverwrites: {
      cache: new Map() // No overrides
    }
  };
}