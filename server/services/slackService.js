import axios from 'axios';

class SlackService {
  constructor(botToken) {
    this.botToken = botToken;
    this.baseURL = 'https://slack.com/api';
  }

  async makeRequest(endpoint, params = {}) {
    try {
      console.log(`Making Slack API request to: ${endpoint}`);
      console.log(`Token starts with: ${this.botToken.substring(0, 10)}...`);
      
      const response = await axios.get(`${this.baseURL}/${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json'
        },
        params
      });

      if (!response.data.ok) {
        console.error('Slack API error response:', response.data);
        throw new Error(`Slack API Error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      if (error.response?.data) {
        console.error('Slack API error details:', error.response.data);
      }
      console.error('Slack API request failed:', error.message);
      throw error;
    }
  }

  async getChannels() {
    const data = await this.makeRequest('conversations.list', {
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 100
    });
    return data.channels;
  }

  async getChannelMessages(channelId, startDate, endDate) {
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

    console.log(`Slack: Fetching messages from ${startTimestamp} to ${endTimestamp} (${startDate} to ${endDate})`);

    const data = await this.makeRequest('conversations.history', {
      channel: channelId,
      oldest: startTimestamp,
      latest: endTimestamp,
      limit: 100
    });

    const messages = data.messages || [];
    console.log(`Slack: Retrieved ${messages.length} messages for channel ${channelId}`);
    
    return messages;
  }

  async getTeamChannelMessages(startDate, endDate, teamChannels = []) {
    const channels = await this.getChannels();
    const allMessages = [];

    // Filter to team channels if specified, otherwise use common dev channels
    const targetChannels = teamChannels.length > 0 
      ? channels.filter(ch => teamChannels.includes(ch.name))
      : channels.filter(ch => 
          ch.name.includes('dev') || 
          ch.name.includes('engineering') || 
          ch.name.includes('team') ||
          ch.name.includes('general') ||
          ch.name.includes('standup')
        );

    console.log(`Fetching messages from ${targetChannels.length} channels:`, 
      targetChannels.map(ch => ch.name));

    for (const channel of targetChannels.slice(0, 5)) { // Limit to 5 channels for performance
      try {
        const messages = await this.getChannelMessages(channel.id, startDate, endDate);
        allMessages.push(...messages.map(msg => ({
          ...msg,
          channel: channel.name,
          channelId: channel.id
        })));
      } catch (error) {
        console.warn(`Failed to fetch messages from channel ${channel.name}:`, error.message);
      }
    }

    return allMessages;
  }

  analyzeMessagesForRetro(messages) {
    const wentWell = [];
    const didntGoWell = [];
    const actionItems = [];

    // Positive sentiment indicators
    const positiveKeywords = [
      'great', 'awesome', 'excellent', 'perfect', 'love', 'amazing', 
      'fantastic', 'good job', 'well done', 'congrats', 'celebration',
      'thanks', 'thank you', 'nice', 'good', 'solid', 'clean', 'smooth',
      'shipped', 'deployed', 'released', 'done', 'completed', 'finished',
      '🎉', '👏', '🚀', '✅', '💪', '🔥', '👍', '❤️', '😊', '😄'
    ];

    // Negative sentiment indicators
    const negativeKeywords = [
      'blocked', 'stuck', 'problem', 'issue', 'bug', 'broken', 'failed',
      'frustrated', 'annoying', 'slow', 'urgent', 'critical', 'help',
      'error', 'crash', 'down', 'not working', 'broken', 'fix',
      '😤', '😞', '🐛', '🚨', '⚠️', '❌', '😕', '😰'
    ];

    // Process indicators
    const processKeywords = [
      'meeting', 'standup', 'retro', 'planning', 'review', 'demo',
      'deployment', 'release', 'merge', 'pr', 'pull request'
    ];

    const positiveMessages = messages.filter(msg => 
      positiveKeywords.some(keyword => 
        msg.text?.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    const negativeMessages = messages.filter(msg => 
      negativeKeywords.some(keyword => 
        msg.text?.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    const processMessages = messages.filter(msg => 
      processKeywords.some(keyword => 
        msg.text?.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    // Analyze message patterns
    const totalMessages = messages.length;
    const uniqueUsers = new Set(messages.map(msg => msg.user)).size;
    const avgMessagesPerUser = totalMessages / uniqueUsers;

    console.log(`Slack analysis: ${totalMessages} messages from ${uniqueUsers} users`);
    console.log(`Positive messages: ${positiveMessages.length}, Negative: ${negativeMessages.length}`);

    // Positive insights
    if (positiveMessages.length > totalMessages * 0.1) { // >10% positive
      wentWell.push({
        title: `High team morale in Slack conversations`,
        details: `${positiveMessages.length} positive messages out of ${totalMessages} total`,
        source: 'slack',
        data: { positiveMessages: positiveMessages.slice(0, 3) }
      });
    }

    // Check for celebration/success messages
    const celebrationMessages = messages.filter(msg => 
      msg.text?.toLowerCase().includes('shipped') ||
      msg.text?.toLowerCase().includes('deployed') ||
      msg.text?.toLowerCase().includes('released') ||
      msg.reactions?.some(r => ['tada', 'rocket', 'fire'].includes(r.name))
    );

    if (celebrationMessages.length > 0) {
      wentWell.push({
        title: `Team celebrated ${celebrationMessages.length} achievements`,
        details: 'Good team culture around recognizing wins',
        source: 'slack',
        data: { celebrationMessages }
      });
    }

    // Negative insights
    if (negativeMessages.length > totalMessages * 0.15) { // >15% negative
      didntGoWell.push({
        title: `High frustration signals in team chat`,
        details: `${negativeMessages.length} messages indicating problems or blockers`,
        source: 'slack',
        data: { negativeMessages: negativeMessages.slice(0, 3) }
      });

      actionItems.push({
        title: 'Address recurring team frustrations',
        priority: 'medium',
        assignee: 'team',
        details: 'Multiple frustration signals detected in Slack'
      });
    }

    // Communication patterns
    if (avgMessagesPerUser < 5) {
      didntGoWell.push({
        title: 'Low team communication activity',
        details: `Only ${avgMessagesPerUser.toFixed(1)} messages per person on average`,
        source: 'slack',
        data: { totalMessages, uniqueUsers }
      });

      actionItems.push({
        title: 'Encourage more team communication',
        priority: 'low',
        assignee: 'team',
        details: 'Consider more async updates or check-ins'
      });
    }

    // Process insights
    const standupMessages = processMessages.filter(msg => 
      msg.text?.toLowerCase().includes('standup') ||
      msg.text?.toLowerCase().includes('daily')
    );

    if (standupMessages.length > 0) {
      wentWell.push({
        title: `Active standup participation`,
        details: `${standupMessages.length} standup-related messages`,
        source: 'slack',
        data: { standupMessages }
      });
    }

    // Add general activity insights if we have data
    if (totalMessages > 0) {
      if (totalMessages > 50) {
        wentWell.push({
          title: `Active team communication`,
          details: `${totalMessages} messages from ${uniqueUsers} team members`,
          source: 'slack',
          data: { totalMessages, uniqueUsers }
        });
      }

      // Show channel activity breakdown
      const channelActivity = {};
      messages.forEach(msg => {
        channelActivity[msg.channel] = (channelActivity[msg.channel] || 0) + 1;
      });

      const mostActiveChannel = Object.entries(channelActivity)
        .sort(([,a], [,b]) => b - a)[0];

      if (mostActiveChannel) {
        wentWell.push({
          title: `Most active channel: #${mostActiveChannel[0]}`,
          details: `${mostActiveChannel[1]} messages in this channel`,
          source: 'slack',
          data: { channelActivity }
        });
      }
    } else {
      didntGoWell.push({
        title: 'Limited Slack activity detected',
        details: 'Bot may need to be added to more team channels',
        source: 'slack',
        data: { totalMessages: 0 }
      });
    }

    return { wentWell, didntGoWell, actionItems };
  }
}

export default SlackService;