/**
 * Progress Tracker for LLM Analysis
 * Provides real-time progress updates and estimated completion times
 */

import { EventEmitter } from 'events';

export class ProgressTracker extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.startTime = null;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.steps = [];
    this.completed = false;
    this.error = null;
  }

  /**
   * Initialize progress tracking with steps
   * @param {Array} steps - Array of step definitions
   */
  initialize(steps) {
    this.steps = steps.map((step, index) => ({
      id: index,
      name: step.name,
      description: step.description,
      estimatedDuration: step.estimatedDuration || 5000,
      status: 'pending',
      startTime: null,
      endTime: null,
      error: null
    }));
    
    this.totalSteps = this.steps.length;
    this.startTime = Date.now();
    this.currentStep = 0;
    
    this.emit('initialized', {
      sessionId: this.sessionId,
      totalSteps: this.totalSteps,
      steps: this.steps.map(s => ({ name: s.name, description: s.description }))
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
        metadata: step.metadata
      },
      progress
    });
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
    step.status = 'completed';
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
        result: step.result
      },
      progress
    });

    // Check if all steps are completed
    if (this.isCompleted()) {
      this.complete();
    }
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
   * Complete the entire process
   */
  complete() {
    this.completed = true;
    const totalDuration = Date.now() - this.startTime;
    
    this.emit('completed', {
      sessionId: this.sessionId,
      totalDuration,
      steps: this.steps.map(s => ({
        name: s.name,
        status: s.status,
        duration: s.endTime ? s.endTime - s.startTime : null
      }))
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
      totalSteps: this.totalSteps
    });
  }

  /**
   * Calculate overall progress
   * @returns {Object} Progress information
   */
  calculateProgress() {
    const completedSteps = this.steps.filter(s => s.status === 'completed').length;
    const failedSteps = this.steps.filter(s => s.status === 'failed').length;
    const inProgressSteps = this.steps.filter(s => s.status === 'in_progress').length;
    
    let overallProgress = completedSteps / this.totalSteps;
    
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
      totalSteps: this.totalSteps,
      failedSteps,
      currentStep: this.currentStep,
      elapsedTime,
      estimatedTimeRemaining,
      estimatedTotalTime: elapsedTime + estimatedTimeRemaining
    };
  }

  /**
   * Calculate estimated time remaining
   * @returns {number} Estimated milliseconds remaining
   */
  calculateEstimatedTimeRemaining() {
    const completedSteps = this.steps.filter(s => s.status === 'completed');
    const remainingSteps = this.steps.filter(s => s.status === 'pending');
    
    if (completedSteps.length === 0) {
      // Use estimated durations for all remaining steps
      return remainingSteps.reduce((total, step) => total + step.estimatedDuration, 0);
    }

    // Calculate average duration from completed steps
    const totalCompletedDuration = completedSteps.reduce((total, step) => {
      return total + (step.endTime - step.startTime);
    }, 0);
    
    const averageDuration = totalCompletedDuration / completedSteps.length;
    
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
      step.status === 'completed' || step.status === 'failed'
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
      currentStep: this.currentStep < this.steps.length ? {
        index: this.currentStep,
        name: this.steps[this.currentStep].name,
        description: this.steps[this.currentStep].description,
        status: this.steps[this.currentStep].status
      } : null
    };
  }

  /**
   * Get step history
   * @returns {Array} Array of step information
   */
  getStepHistory() {
    return this.steps.map(step => ({
      name: step.name,
      description: step.description,
      status: step.status,
      startTime: step.startTime,
      endTime: step.endTime,
      duration: step.endTime && step.startTime ? step.endTime - step.startTime : null,
      error: step.error?.message,
      result: step.result
    }));
  }
}

/**
 * Progress Manager for handling multiple concurrent progress trackers
 */
export class ProgressManager {
  constructor() {
    this.trackers = new Map();
  }

  /**
   * Create a new progress tracker
   * @param {string} sessionId - Unique session identifier
   * @param {Array} steps - Array of step definitions
   * @returns {ProgressTracker} New progress tracker
   */
  createTracker(sessionId, steps) {
    const tracker = new ProgressTracker(sessionId);
    tracker.initialize(steps);
    
    this.trackers.set(sessionId, tracker);
    
    // Clean up tracker when completed or failed
    tracker.on('completed', () => {
      setTimeout(() => this.trackers.delete(sessionId), 60000); // Keep for 1 minute
    });
    
    tracker.on('failed', () => {
      setTimeout(() => this.trackers.delete(sessionId), 60000); // Keep for 1 minute
    });
    
    return tracker;
  }

  /**
   * Get existing tracker
   * @param {string} sessionId - Session identifier
   * @returns {ProgressTracker|null} Existing tracker or null
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
  cleanup(maxAge = 300000) { // 5 minutes default
    const now = Date.now();
    
    for (const [sessionId, tracker] of this.trackers.entries()) {
      if (tracker.completed && (now - tracker.startTime) > maxAge) {
        this.removeTracker(sessionId);
      }
    }
  }
}

// Default step definitions for LLM analysis
export const DEFAULT_LLM_STEPS = [
  {
    name: 'Data Preparation',
    description: 'Collecting and sanitizing team data',
    estimatedDuration: 3000
  },
  {
    name: 'Prompt Generation',
    description: 'Creating optimized prompts for AI analysis',
    estimatedDuration: 2000
  },
  {
    name: 'AI Analysis',
    description: 'Processing data with AI model',
    estimatedDuration: 15000
  },
  {
    name: 'Response Processing',
    description: 'Parsing and validating AI insights',
    estimatedDuration: 2000
  },
  {
    name: 'Insight Merging',
    description: 'Combining AI and rule-based insights',
    estimatedDuration: 1000
  }
];