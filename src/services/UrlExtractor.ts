import { Message } from 'discord.js';
import { Logger } from '../utils/Logger';

export interface ExtractedUrls {
  chartUrls: string[];
  attachmentUrls: string[];
  hasCharts: boolean;
}

export class UrlExtractor {
  private static readonly CHART_DOMAINS = [
    'tradingview.com',
    'charts.com',
    'finviz.com',
    'yahoo.com',
    'marketwatch.com',
    'investing.com',
    'stockcharts.com',
    'barchart.com'
  ];

  private static readonly IMAGE_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'
  ];

  public extractUrlsFromMessage(message: Message): ExtractedUrls {
    Logger.debug(`Processing message ${message.id}: attachments=${message.attachments?.size || 0}, embeds=${message.embeds?.length || 0}`);
    
    const chartUrls: string[] = [];
    const attachmentUrls: string[] = [];

    const contentUrls = this.extractUrlsFromContent(message.content);
    chartUrls.push(...contentUrls);

    const messageAttachments = this.extractAttachmentUrls(message);
    attachmentUrls.push(...messageAttachments);

    const embedResult = this.extractUrlsFromEmbeds(message);
    attachmentUrls.push(...embedResult.images);
    chartUrls.push(...embedResult.chartUrls);

    const uniqueChartUrls = [...new Set(chartUrls)].filter(url => this.isValidUrl(url));
    const uniqueAttachmentUrls = [...new Set(attachmentUrls)].filter(url => this.isValidUrl(url));

    Logger.urlExtraction(`Extracted URLs from message ${message.id}: charts=${uniqueChartUrls.length}, attachments=${uniqueAttachmentUrls.length}`);

    return {
      chartUrls: uniqueChartUrls,
      attachmentUrls: uniqueAttachmentUrls,
      hasCharts: uniqueChartUrls.length > 0 || uniqueAttachmentUrls.length > 0
    };
  }

  private extractUrlsFromContent(content: string): string[] {
    const urls: string[] = [];
    
    // Regex to match URLs in message content
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    const matches = content.match(urlRegex);

    if (matches) {
      for (const url of matches) {
        // Clean up the URL (remove trailing punctuation)
        const cleanUrl = url.replace(/[.,;!?)]$/, '');
        
        // Check if it's a chart-related URL or image
        if (this.isChartUrl(cleanUrl) || this.isImageUrl(cleanUrl)) {
          urls.push(cleanUrl);
        }
      }
    }

    return urls;
  }

  private extractAttachmentUrls(message: Message): string[] {
    const urls: string[] = [];

    if (message.attachments && message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        urls.push(attachment.url);
      }
    }

    return urls;
  }

  private extractUrlsFromEmbeds(message: Message): { images: string[], chartUrls: string[] } {
    const images: string[] = [];
    const chartUrls: string[] = [];

    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        if (!embed) continue;

        if (embed.url) {
          if (this.isChartUrl(embed.url)) {
            chartUrls.push(embed.url);
          } else {
            images.push(embed.url);
          }
        }

        if (embed.image?.url) {
          images.push(embed.image.url);
        }

        if (embed.thumbnail?.url) {
          images.push(embed.thumbnail.url);
        }

        if (embed.author?.url) {
          images.push(embed.author.url);
        }
      }
    }

    return { images, chartUrls };
  }

  private isChartUrl(url: string): boolean {
    try {
      const urlObj = new URL(url.toLowerCase());
      
      // Check if the domain matches known chart providers
      return UrlExtractor.CHART_DOMAINS.some(domain => 
        urlObj.hostname.includes(domain)
      );
    } catch {
      return false;
    }
  }

  private isImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url.toLowerCase());
      
      // Check if the URL path ends with an image extension
      return UrlExtractor.IMAGE_EXTENSIONS.some(ext => 
        urlObj.pathname.toLowerCase().endsWith(ext)
      );
    } catch {
      return false;
    }
  }

  private isImageAttachment(filename: string, contentType: string): boolean {
    // Check by file extension
    if (UrlExtractor.IMAGE_EXTENSIONS.some(ext => 
      filename.toLowerCase().endsWith(ext)
    )) {
      return true;
    }

    // Check by content type
    return contentType.startsWith('image/');
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  public static isMessageWithCharts(message: Message): boolean {
    const extractor = new UrlExtractor();
    const extracted = extractor.extractUrlsFromMessage(message);
    return extracted.hasCharts;
  }
}