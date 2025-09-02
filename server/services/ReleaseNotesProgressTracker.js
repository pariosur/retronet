/**
 * Release Notes Progress Tracker
 * Provides detailed progress tracking for release notes generation with user-friendly messages
 */

import { ProgressTracker } from './llm/ProgressTracker.js';
import { EventEmitter } from 'events';

export class ReleaseNotesProgressTracker extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.startTime = null;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.steps = [];
    this.completed = false;
    this.error = null;
    this.dataSourceStatus = {};
    this.degradationInfo = null;
  }

  /**
   * Initialize progress tracking for release notes generation
   * @param {Object} options - Generation options
   */
  initialize(options = {}) {
    this.steps = [
      {
        id: 0,
        name: 'Validation',
        description: 'Validating date range and configuration',
        userMessage: 'Checking your settings...',
        estimatedDuration: 1000,
        status: 'pending'
      },
      {
        id: 1,
        name: 'Data Collection',
        description: 'Collecting data from GitHub, Linear, and Slack',
        userMessage: 'Gathering development activity...',
        estimatedDuration: 8000,
        status: 'pending',
        subSteps: [
          { name: 'GitHub', description: 'Fetching commits and pull requests' },
          { name: 'Linear', description: 'Collecting issues and tickets' },
          { name: 'Slack', description: 'Analyzing team discussions' }
        ]
      },
      {
        id: 2,
        name: 'Analysis',
        description: 'Analyzing changes for user impact',
        userMessage: 'Identifying user-facing changes...',
        estimatedDuration: 5000,
        status: 'pending'
      },
      {
        id: 3,
        name: 'AI Processing',
        description: 'Using AI to generate user-friendly descriptions',
        userMessage: 'Creating customer-friendly descriptions...',
        estimatedDuration: 12000,
        status: 'pending',
        optional: true // Can be skipped if LLM fails
      },
      {
        id: 4,
        name: 'Categorization',
        description: 'Organizing changes into features, improvements, and fixes',
        userMessage: 'Categorizing changes...',
        estimatedDuration: 3000,
        status: 'pending'
      },
      {
        id: 5,
        name: 'Finalization',
        description: 'Creating final release notes document',
        userMessage: 'Finalizing release notes...',
        estimatedDuration: 2000,
        status: 'pending'
      }
    ];
    
    this.totalSteps = this.steps.length;
    this.startTime = Date.now();
    this.currentStep = 0;
    
    this.emit('initialized', {
      sessionId: this.sessionId,
      totalSteps: this.totalSteps,
      steps: this.steps.map(s => ({ 
        name: s.name, 
        description: s.description,
        userMessage: s.userMessage,
        optional: s.optional || false
      }))
    });
  }

  /**
   * Start a specific step
   * @param {number} stepIndex - Step index to start
   * @param {Object} metadata - Additional metadata
   */
  startStep(stepIndex, metadata = {}) {
    if (stepIndex >= this.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    this.currentStep = stepIndex;
    const step = this.steps[stepIndex];
    
    step.status = 'in_progress';
    step.startTime = Date.now();
    step.metadata = metadata;

    const progress = this.calculateProgress();
    
    this.emit('step_started', {
      sessionId: this.sessionId,
      stepIndex,
      step: {
        name: step.name,
        description: step.description,
        userMessage: step.userMessage,
        metadata: step.metadata
      },
      progress
    });
  }

  /**
   * Update data source collection progress
   * @param {string} source - Data source name (github, linear, slack)
   * @param {string} status - Status (started, completed, failed)
   * @param {Object} details - Additional details
   */
  updateDataSourceProgress(source, status, details = {}) {
    this.dataSourceStatus[source] = {
      status,
      timestamp: Date.now(),
      ...details
    };

    // Update step 1 (Data Collection) progress
    const dataCollectionStep = this.steps[1];
    if (dataCollectionStep && dataCollectionStep.status === 'in_progress') {
      const sources = ['github', 'linear', 'slack'];
      const completedSources = sources.filter(s => 
        this.dataSourceStatus[s]?.status === 'completed' || 
        this.dataSourceStatus[s]?.status === 'failed'
      ).length;
      
      const stepProgress = completedSources / sources.length;
      
      let message = `Collecting data from ${source}...`;
      if (status === 'completed') {
        message = `✓ ${source} data collected`;
      } else if (status === 'failed') {
        message = `⚠ ${source} unavailable, continuing with other sources`;
      }

      this.updateStepProgress(1, stepProgress, message);
    }

    this.emit('data_source_update', {
      sessionId: this.sessionId,
      source,
      status,
      details,
      allSources: this.dataSourceStatus
    });
  }

  /**
   * Handle data source failure with graceful degradation
   * @param {string} source - Failed data source
   * @param {Error} error - Error that occurred
   */
  handleDataSourceFailure(source, error) {
    this.updateDataSourceProgress(source, 'failed', {
      error: error.message,
      recoverable: error.recoverable || false
    });

    // Check if we can continue with remaining sources
    const availableSources = Object.keys(this.dataSourceStatus).filter(s => 
      this.dataSourceStatus[s].status === 'completed'
    );

    if (availableSources.length === 0) {
      // No sources available - this is critical
      this.degradationInfo = {
        type: 'critical',
        message: 'All data sources failed. Cannot generate release notes.',
        canContinue: false
      };
    } else {
      // Some sources available - continue with degradation
      this.degradationInfo = {
        type: 'partial',
        message: `${source} unavailable. Continuing with ${availableSources.join(', ')}.`,
        canContinue: true,
        availableSources,
        failedSources: [source]
      };
    }

    this.emit('degradation', {
      sessionId: this.sessionId,
      degradationInfo: this.degradationInfo
    });
  }

  /**
   * Handle AI processing failure
   * @param {Error} error - AI processing error
   */
  handleAIFailure(error) {
    const aiStep = this.steps[3]; // AI Processing step
    if (aiStep) {
      aiStep.status = 'skipped';
      aiStep.endTime = Date.now();
      aiStep.skipReason = 'AI processing failed, using rule-based analysis';
      aiStep.error = error;
    }

    this.emit('ai_fallback', {
      sessionId: this.sessionId,
      error: error.message,
      fallbackMessage: 'Using rule-based analysis instead of AI processing'
    });

    // Continue to next step
    this.completeStep(3, { skipped: true, reason: 'AI processing failed' });
  }

  /**
   * Complete a specific step
   * @param {number} stepIndex - Step index to complete
   * @param {Object} result - Step result data
   */
  completeStep(stepIndex, result = {}) {
    if (stepIndex >= this.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = this.steps[stepIndex];
    step.status = result.skipped ? 'skipped' : 'completed';
    step.endTime = Date.now();
    step.result = result;

    const progress = this.calculateProgress();
    
    this.emit('step_completed', {
      sessionId: this.sessionId,
      stepIndex,
      step: {
        name: step.name,
        description: step.description,
        duration: step.endTime - step.startTime,
        result: step.result,
        skipped: result.skipped || false
      },
      progress
    });

    // Check if all steps are completed
    if (this.isCompleted()) {
      this.complete();
    }
  }

  /**
   * Update progress within a step
   * @param {number} stepIndex - Current step index
   * @param {number} stepProgress - Progress within step (0-1)
   * @param {string} message - Progress message
   */
  updateStepProgress(stepIndex, stepProgress, message) {
    if (stepIndex >= this.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = this.steps[stepIndex];
    step.stepProgress = Math.max(0, Math.min(1, stepProgress));
    step.progressMessage = message;

    const progress = this.calculateProgress();
    
    this.emit('step_progress', {
      sessionId: this.sessionId,
      stepIndex,
      stepProgress: step.stepProgress,
      message,
      progress
    });
  }

  /**
   * Mark a step as failed
   * @param {number} stepIndex - Step index that failed
   * @param {Error} error - Error that occurred
   */
  failStep(stepIndex, error) {
    if (stepIndex >= this.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = this.steps[stepIndex];
    step.status = 'failed';
    step.endTime = Date.now();
    step.error = error;

    const progress = this.calculateProgress();
    
    this.emit('step_failed', {
      sessionId: this.sessionId,
      stepIndex,
      step: {
        name: step.name,
        description: step.description,
        duration: step.endTime - step.startTime,
        error: error.message
      },
      progress
    });
  }

  /**
   * Complete the entire process
   */
  complete() {
    this.completed = true;
    const totalDuration = Date.now() - this.startTime;
    
    // Calculate statistics
    const completedSteps = this.steps.filter(s => s.status === 'completed').length;
    const skippedSteps = this.steps.filter(s => s.status === 'skipped').length;
    const failedSteps = this.steps.filter(s => s.status === 'failed').length;
    
    this.emit('completed', {
      sessionId: this.sessionId,
      totalDuration,
      statistics: {
        completedSteps,
        skippedSteps,
        failedSteps,
        totalSteps: this.totalSteps
      },
      degradationInfo: this.degradationInfo,
      dataSourceStatus: this.dataSourceStatus
    });
  }

  /**
   * Fail the entire process
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.error = error;
    this.completed = true;
    
    this.emit('failed', {
      sessionId: this.sessionId,
      error: error.message,
      completedSteps: this.steps.filter(s => s.status === 'completed').length,
      totalSteps: this.totalSteps,
      dataSourceStatus: this.dataSourceStatus
    });
  }

  /**
   * Calculate overall progress
   * @returns {Object} Progress information
   */
  calculateProgress() {
    const completedSteps = this.steps.filter(s => s.status === 'completed').length;
    const skippedSteps = this.steps.filter(s => s.status === 'skipped').length;
    const failedSteps = this.steps.filter(s => s.status === 'failed').length;
    const inProgressSteps = this.steps.filter(s => s.status === 'in_progress').length;
    
    // Count skipped steps as completed for progress calculation
    let overallProgress = (completedSteps + skippedSteps) / this.totalSteps;
    
    // Add partial progress from current step
    if (inProgressSteps > 0) {
      const currentStep = this.steps.find(s => s.status === 'in_progress');
      if (currentStep && currentStep.stepProgress) {
        overallProgress += (currentStep.stepProgress / this.totalSteps);
      }
    }

    const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining();
    const elapsedTime = Date.now() - this.startTime;

    return {
      percentage: Math.round(overallProgress * 100),
      completedSteps,
      skippedSteps,
      totalSteps: this.totalSteps,
      failedSteps,
      currentStep: this.currentStep,
      elapsedTime,
      estimatedTimeRemaining,
      estimatedTotalTime: elapsedTime + estimatedTimeRemaining,
      currentStepName: this.currentStep < this.steps.length ? this.steps[this.currentStep].name : null,
      currentMessage: this.currentStep < this.steps.length ? 
        this.steps[this.currentStep].progressMessage || this.steps[this.currentStep].userMessage : null
    };
  }

  /**
   * Calculate estimated time remaining
   * @returns {number} Estimated milliseconds remaining
   */
  calculateEstimatedTimeRemaining() {
    const completedSteps = this.steps.filter(s => s.status === 'completed' || s.status === 'skipped');
    const remainingSteps = this.steps.filter(s => s.status === 'pending');
    
    if (completedSteps.length === 0) {
      // Use estimated durations for all remaining steps
      return remainingSteps.reduce((total, step) => total + step.estimatedDuration, 0);
    }

    // Calculate average duration from completed steps (excluding skipped)
    const actuallyCompletedSteps = this.steps.filter(s => s.status === 'completed');
    if (actuallyCompletedSteps.length === 0) {
      return remainingSteps.reduce((total, step) => total + step.estimatedDuration, 0);
    }

    const totalCompletedDuration = actuallyCompletedSteps.reduce((total, step) => {
      return total + (step.endTime - step.startTime);
    }, 0);
    
    const averageDuration = totalCompletedDuration / actuallyCompletedSteps.length;
    
    // Estimate remaining time based on average duration
    let remainingTime = remainingSteps.length * averageDuration;
    
    // Add remaining time for current step if in progress
    const currentStep = this.steps.find(s => s.status === 'in_progress');
    if (currentStep) {
      const stepElapsed = Date.now() - currentStep.startTime;
      const stepProgress = currentStep.stepProgress || 0;
      
      if (stepProgress > 0) {
        const estimatedStepTotal = stepElapsed / stepProgress;
        remainingTime += Math.max(0, estimatedStepTotal - stepElapsed);
      } else {
        remainingTime += Math.max(0, averageDuration - stepElapsed);
      }
    }

    return Math.max(0, remainingTime);
  }

  /**
   * Check if all steps are completed
   * @returns {boolean} True if all steps completed
   */
  isCompleted() {
    return this.steps.every(step => 
      step.status === 'completed' || 
      step.status === 'failed' || 
      step.status === 'skipped'
    );
  }

  /**
   * Get current status
   * @returns {Object} Current status information
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      completed: this.completed,
      error: this.error?.message,
      progress: this.calculateProgress(),
      degradationInfo: this.degradationInfo,
      dataSourceStatus: this.dataSourceStatus,
      currentStep: this.currentStep < this.steps.length ? {
        index: this.currentStep,
        name: this.steps[this.currentStep].name,
        description: this.steps[this.currentStep].description,
        userMessage: this.steps[this.currentStep].userMessage,
        status: this.steps[this.currentStep].status
      } : null
    };
  }

  /**
   * Get user-friendly status message
   * @returns {string} User-friendly status message
   */
  getUserFriendlyStatus() {
    if (this.completed) {
      if (this.error) {
        return 'Release notes generation failed';
      }
      
      if (this.degradationInfo) {
        return `Release notes generated with ${this.degradationInfo.type} data availability`;
      }
      
      return 'Release notes generated successfully';
    }

    if (this.currentStep < this.steps.length) {
      const step = this.steps[this.currentStep];
      return step.progressMessage || step.userMessage || step.description;
    }

    return 'Preparing to generate release notes...';
  }
}

/**
 * Release Notes Progress Manager
 * Manages multiple concurrent release notes generation sessions
 */
export class ReleaseNotesProgressManager {
  constructor() {
    this.trackers = new Map();
  }

  /**
   * Create a new progress tracker for release notes generation
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Generation options
   * @returns {ReleaseNotesProgressTracker} New progress tracker
   */
  createTracker(sessionId, options = {}) {
    const tracker = new ReleaseNotesProgressTracker(sessionId);
    tracker.initialize(options);
    
    this.trackers.set(sessionId, tracker);
    
    // Clean up tracker when completed or failed
    tracker.on('completed', () => {
      setTimeout(() => this.trackers.delete(sessionId), 120000); // Keep for 2 minutes
    });
    
    tracker.on('failed', () => {
      setTimeout(() => this.trackers.delete(sessionId), 120000); // Keep for 2 minutes
    });
    
    return tracker;
  }

  /**
   * Get existing tracker
   * @param {string} sessionId - Session identifier
   * @returns {ReleaseNotesProgressTracker|null} Existing tracker or null
   */
  getTracker(sessionId) {
    return this.trackers.get(sessionId) || null;
  }

  /**
   * Remove tracker
   * @param {string} sessionId - Session identifier
   */
  removeTracker(sessionId) {
    const tracker = this.trackers.get(sessionId);
    if (tracker) {
      tracker.removeAllListeners();
      this.trackers.delete(sessionId);
    }
  }

  /**
   * Get all active trackers
   * @returns {Array} Array of active tracker statuses
   */
  getActiveTrackers() {
    return Array.from(this.trackers.values()).map(tracker => tracker.getStatus());
  }

  /**
   * Clean up old trackers
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge = 600000) { // 10 minutes default
    const now = Date.now();
    
    for (const [sessionId, tracker] of this.trackers.entries()) {
      if (tracker.completed && (now - tracker.startTime) > maxAge) {
        this.removeTracker(sessionId);
      }
    }
  }
}