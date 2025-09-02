/**
 * Data models and validation for Release Notes
 * 
 * This module defines the data structures and validation logic for release notes
 * entries and documents, ensuring data integrity and consistency.
 */

/**
 * ReleaseNotesEntry - Represents a single entry in the release notes
 */
export class ReleaseNotesEntry {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.title = data.title || '';
    this.description = data.description || '';
    this.category = data.category || 'improvement';
    this.impact = data.impact || 'medium';
    this.userValue = data.userValue || '';
    this.technicalDetails = data.technicalDetails || {
      commits: [],
      issues: [],
      pullRequests: []
    };
    this.confidence = data.confidence || 0.5;
    this.source = data.source || 'rules';
    this.metadata = {
      originalTitle: data.metadata?.originalTitle || data.title || '',
      translationConfidence: data.metadata?.translationConfidence || 0.5,
      reviewRequired: data.metadata?.reviewRequired || false,
      createdAt: data.metadata?.createdAt || new Date().toISOString(),
      updatedAt: data.metadata?.updatedAt || new Date().toISOString(),
      ...data.metadata
    };

    // Validate the entry
    this._validate();
  }

  /**
   * Validate the release notes entry
   * @private
   */
  _validate() {
    const errors = [];

    // Required fields validation
    if (!this.title || typeof this.title !== 'string' || this.title.trim().length === 0) {
      errors.push('Title is required and must be a non-empty string');
    }

    if (!this.description || typeof this.description !== 'string' || this.description.trim().length === 0) {
      errors.push('Description is required and must be a non-empty string');
    }

    // Category validation
    const validCategories = ['feature', 'improvement', 'fix'];
    if (!validCategories.includes(this.category)) {
      errors.push(`Category must be one of: ${validCategories.join(', ')}`);
    }

    // Impact validation
    const validImpacts = ['high', 'medium', 'low'];
    if (!validImpacts.includes(this.impact)) {
      errors.push(`Impact must be one of: ${validImpacts.join(', ')}`);
    }

    // Confidence validation
    if (typeof this.confidence !== 'number' || this.confidence < 0 || this.confidence > 1) {
      errors.push('Confidence must be a number between 0 and 1');
    }

    // Source validation
    const validSources = ['ai', 'rules', 'manual'];
    if (!validSources.includes(this.source)) {
      errors.push(`Source must be one of: ${validSources.join(', ')}`);
    }

    // Technical details validation
    if (this.technicalDetails && typeof this.technicalDetails === 'object') {
      if (this.technicalDetails.commits && !Array.isArray(this.technicalDetails.commits)) {
        errors.push('Technical details commits must be an array');
      }
      if (this.technicalDetails.issues && !Array.isArray(this.technicalDetails.issues)) {
        errors.push('Technical details issues must be an array');
      }
      if (this.technicalDetails.pullRequests && !Array.isArray(this.technicalDetails.pullRequests)) {
        errors.push('Technical details pullRequests must be an array');
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`ReleaseNotesEntry validation failed: ${errors.join('; ')}`);
    }
  }

  /**
   * Generate a unique ID for the entry
   * @private
   */
  _generateId() {
    return `release-entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update the entry with new data
   * @param {Object} updates - Updates to apply
   */
  update(updates) {
    const allowedUpdates = [
      'title', 'description', 'category', 'impact', 'userValue', 
      'confidence', 'source', 'technicalDetails'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        this[key] = value;
      }
    }

    // Update metadata
    this.metadata.updatedAt = new Date().toISOString();
    if (updates.metadata) {
      this.metadata = { ...this.metadata, ...updates.metadata };
    }

    // Re-validate after updates
    this._validate();
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      category: this.category,
      impact: this.impact,
      userValue: this.userValue,
      technicalDetails: this.technicalDetails,
      confidence: this.confidence,
      source: this.source,
      metadata: this.metadata
    };
  }

  /**
   * Create a ReleaseNotesEntry from a plain object
   * @param {Object} data - Plain object data
   * @returns {ReleaseNotesEntry}
   */
  static fromJSON(data) {
    return new ReleaseNotesEntry(data);
  }

  /**
   * Validate entry data without creating an instance
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  static validate(data) {
    try {
      new ReleaseNotesEntry(data);
      return { isValid: true, errors: [] };
    } catch (error) {
      if (error instanceof ValidationError) {
        return { isValid: false, errors: [error.message] };
      }
      return { isValid: false, errors: ['Unknown validation error'] };
    }
  }
}

/**
 * ReleaseNotesDocument - Represents a complete release notes document
 */
export class ReleaseNotesDocument {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.title = data.title || '';
    this.dateRange = data.dateRange || { start: '', end: '' };
    this.generatedAt = data.generatedAt || new Date().toISOString();
    this.entries = {
      newFeatures: (data.entries?.newFeatures || []).map(entry => 
        entry instanceof ReleaseNotesEntry ? entry : new ReleaseNotesEntry(entry)
      ),
      improvements: (data.entries?.improvements || []).map(entry => 
        entry instanceof ReleaseNotesEntry ? entry : new ReleaseNotesEntry(entry)
      ),
      fixes: (data.entries?.fixes || []).map(entry => 
        entry instanceof ReleaseNotesEntry ? entry : new ReleaseNotesEntry(entry)
      )
    };
    this.metadata = {
      totalChanges: data.metadata?.totalChanges || 0,
      userFacingChanges: data.metadata?.userFacingChanges || 0,
      aiGenerated: data.metadata?.aiGenerated || 0,
      manuallyReviewed: data.metadata?.manuallyReviewed || 0,
      sources: data.metadata?.sources || [],
      generationMethod: data.metadata?.generationMethod || 'rules',
      confidence: data.metadata?.confidence || 0.5,
      version: data.metadata?.version || '1.0.0',
      ...data.metadata
    };

    // Auto-calculate metadata if not provided
    this._updateCalculatedMetadata();

    // Validate the document
    this._validate();
  }

  /**
   * Validate the release notes document
   * @private
   */
  _validate() {
    const errors = [];

    // Required fields validation
    if (!this.title || typeof this.title !== 'string' || this.title.trim().length === 0) {
      errors.push('Title is required and must be a non-empty string');
    }

    // Date range validation
    if (!this.dateRange || typeof this.dateRange !== 'object') {
      errors.push('Date range is required and must be an object');
    } else {
      if (!this.dateRange.start || typeof this.dateRange.start !== 'string') {
        errors.push('Date range start is required and must be a string');
      }
      if (!this.dateRange.end || typeof this.dateRange.end !== 'string') {
        errors.push('Date range end is required and must be a string');
      }

      // Validate date format and logic
      if (this.dateRange.start && this.dateRange.end) {
        try {
          const startDate = new Date(this.dateRange.start);
          const endDate = new Date(this.dateRange.end);

          if (isNaN(startDate.getTime())) {
            errors.push('Date range start must be a valid date');
          }
          if (isNaN(endDate.getTime())) {
            errors.push('Date range end must be a valid date');
          }
          if (startDate >= endDate) {
            errors.push('Date range start must be before end date');
          }
        } catch (error) {
          errors.push('Invalid date format in date range');
        }
      }
    }

    // Generated at validation
    if (this.generatedAt) {
      try {
        const generatedDate = new Date(this.generatedAt);
        if (isNaN(generatedDate.getTime())) {
          errors.push('Generated at must be a valid date');
        }
      } catch (error) {
        errors.push('Invalid generated at date format');
      }
    }

    // Entries validation
    if (!this.entries || typeof this.entries !== 'object') {
      errors.push('Entries is required and must be an object');
    } else {
      const requiredCategories = ['newFeatures', 'improvements', 'fixes'];
      for (const category of requiredCategories) {
        if (!Array.isArray(this.entries[category])) {
          errors.push(`Entries.${category} must be an array`);
        } else {
          // Validate each entry
          this.entries[category].forEach((entry, index) => {
            if (!(entry instanceof ReleaseNotesEntry)) {
              errors.push(`Entries.${category}[${index}] must be a ReleaseNotesEntry instance`);
            }
          });
        }
      }
    }

    // Metadata validation
    if (this.metadata && typeof this.metadata === 'object') {
      const numericFields = ['totalChanges', 'userFacingChanges', 'aiGenerated', 'manuallyReviewed', 'confidence'];
      for (const field of numericFields) {
        if (this.metadata[field] !== undefined && typeof this.metadata[field] !== 'number') {
          errors.push(`Metadata.${field} must be a number`);
        }
      }

      if (this.metadata.confidence !== undefined && 
          (this.metadata.confidence < 0 || this.metadata.confidence > 1)) {
        errors.push('Metadata confidence must be between 0 and 1');
      }

      if (this.metadata.sources && !Array.isArray(this.metadata.sources)) {
        errors.push('Metadata sources must be an array');
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`ReleaseNotesDocument validation failed: ${errors.join('; ')}`);
    }
  }

  /**
   * Update calculated metadata based on current entries
   * @private
   */
  _updateCalculatedMetadata() {
    const allEntries = [
      ...this.entries.newFeatures,
      ...this.entries.improvements,
      ...this.entries.fixes
    ];

    this.metadata.totalChanges = allEntries.length;
    this.metadata.userFacingChanges = allEntries.length; // All entries are user-facing by definition
    this.metadata.aiGenerated = allEntries.filter(entry => entry.source === 'ai').length;
    this.metadata.manuallyReviewed = allEntries.filter(entry => 
      entry.metadata.reviewRequired === false || entry.source === 'manual'
    ).length;

    // Calculate overall confidence
    if (allEntries.length > 0) {
      const totalConfidence = allEntries.reduce((sum, entry) => sum + entry.confidence, 0);
      this.metadata.confidence = totalConfidence / allEntries.length;
    } else {
      this.metadata.confidence = 0;
    }
  }

  /**
   * Generate a unique ID for the document
   * @private
   */
  _generateId() {
    return `release-notes-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add an entry to the document
   * @param {ReleaseNotesEntry|Object} entry - Entry to add
   * @param {string} category - Category to add to (optional, will use entry.category)
   */
  addEntry(entry, category = null) {
    const releaseEntry = entry instanceof ReleaseNotesEntry ? entry : new ReleaseNotesEntry(entry);
    const targetCategory = category || this._mapCategoryToProperty(releaseEntry.category);

    if (!this.entries[targetCategory]) {
      throw new Error(`Invalid category: ${targetCategory}`);
    }

    this.entries[targetCategory].push(releaseEntry);
    this._updateCalculatedMetadata();
  }

  /**
   * Remove an entry from the document
   * @param {string} entryId - ID of entry to remove
   */
  removeEntry(entryId) {
    let removed = false;
    
    for (const category of Object.keys(this.entries)) {
      const index = this.entries[category].findIndex(entry => entry.id === entryId);
      if (index !== -1) {
        this.entries[category].splice(index, 1);
        removed = true;
        break;
      }
    }

    if (removed) {
      this._updateCalculatedMetadata();
    }

    return removed;
  }

  /**
   * Update an entry in the document
   * @param {string} entryId - ID of entry to update
   * @param {Object} updates - Updates to apply
   */
  updateEntry(entryId, updates) {
    for (const category of Object.keys(this.entries)) {
      const entry = this.entries[category].find(entry => entry.id === entryId);
      if (entry) {
        // Check if category will change before updating
        const willChangeCategory = updates.category && updates.category !== entry.category;
        const newCategory = willChangeCategory ? this._mapCategoryToProperty(updates.category) : null;
        
        // Update the entry
        entry.update(updates);
        
        // If category changed, move the entry
        if (willChangeCategory && newCategory !== category && this.entries[newCategory]) {
          // Remove from current category
          const index = this.entries[category].findIndex(e => e.id === entryId);
          this.entries[category].splice(index, 1);
          
          // Add to new category
          this.entries[newCategory].push(entry);
        }
        
        this._updateCalculatedMetadata();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get an entry by ID
   * @param {string} entryId - ID of entry to get
   * @returns {ReleaseNotesEntry|null}
   */
  getEntry(entryId) {
    for (const category of Object.keys(this.entries)) {
      const entry = this.entries[category].find(entry => entry.id === entryId);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Get all entries as a flat array
   * @returns {ReleaseNotesEntry[]}
   */
  getAllEntries() {
    return [
      ...this.entries.newFeatures,
      ...this.entries.improvements,
      ...this.entries.fixes
    ];
  }

  /**
   * Map category string to property name
   * @private
   */
  _mapCategoryToProperty(category) {
    const mapping = {
      'feature': 'newFeatures',
      'improvement': 'improvements',
      'fix': 'fixes'
    };
    return mapping[category] || 'improvements';
  }

  /**
   * Update document metadata
   * @param {Object} updates - Metadata updates
   */
  updateMetadata(updates) {
    this.metadata = { ...this.metadata, ...updates };
    this._validate();
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      dateRange: this.dateRange,
      generatedAt: this.generatedAt,
      entries: {
        newFeatures: this.entries.newFeatures.map(entry => entry.toJSON()),
        improvements: this.entries.improvements.map(entry => entry.toJSON()),
        fixes: this.entries.fixes.map(entry => entry.toJSON())
      },
      metadata: this.metadata
    };
  }

  /**
   * Create a ReleaseNotesDocument from a plain object
   * @param {Object} data - Plain object data
   * @returns {ReleaseNotesDocument}
   */
  static fromJSON(data) {
    return new ReleaseNotesDocument(data);
  }

  /**
   * Validate document data without creating an instance
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  static validate(data) {
    try {
      new ReleaseNotesDocument(data);
      return { isValid: true, errors: [] };
    } catch (error) {
      if (error instanceof ValidationError) {
        return { isValid: false, errors: [error.message] };
      }
      return { isValid: false, errors: ['Unknown validation error'] };
    }
  }
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Utility functions for release notes data
 */
export const ReleaseNotesUtils = {
  /**
   * Create a release notes entry from raw change data
   * @param {Object} changeData - Raw change data
   * @param {Object} options - Creation options
   * @returns {ReleaseNotesEntry}
   */
  createEntryFromChange(changeData, options = {}) {
    const entry = new ReleaseNotesEntry({
      title: changeData.title || 'Untitled Change',
      description: changeData.description || changeData.title || 'No description available',
      category: changeData.category || 'improvement',
      impact: changeData.impact || 'medium',
      userValue: changeData.userValue || 'Improves the overall product experience',
      confidence: changeData.confidence || 0.5,
      source: changeData.source || 'rules',
      technicalDetails: {
        commits: changeData.commits || [],
        issues: changeData.issues || [],
        pullRequests: changeData.pullRequests || []
      },
      metadata: {
        originalTitle: changeData.originalTitle || changeData.title,
        translationConfidence: changeData.translationConfidence || 0.5,
        reviewRequired: changeData.reviewRequired || false,
        sourceData: changeData.sourceData,
        ...options.metadata
      }
    });

    return entry;
  },

  /**
   * Merge multiple release notes documents
   * @param {ReleaseNotesDocument[]} documents - Documents to merge
   * @param {Object} options - Merge options
   * @returns {ReleaseNotesDocument}
   */
  mergeDocuments(documents, options = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('Documents array is required and must not be empty');
    }

    const firstDoc = documents[0];
    const mergedEntries = {
      newFeatures: [],
      improvements: [],
      fixes: []
    };

    // Collect all entries
    for (const doc of documents) {
      for (const category of Object.keys(mergedEntries)) {
        mergedEntries[category].push(...doc.entries[category]);
      }
    }

    // Create merged document
    const mergedDoc = new ReleaseNotesDocument({
      title: options.title || `Merged Release Notes - ${new Date().toISOString().split('T')[0]}`,
      dateRange: {
        start: new Date(Math.min(...documents.map(d => new Date(d.dateRange.start)))).toISOString(),
        end: new Date(Math.max(...documents.map(d => new Date(d.dateRange.end)))).toISOString()
      },
      entries: mergedEntries,
      metadata: {
        ...firstDoc.metadata,
        sources: [...new Set(documents.flatMap(d => d.metadata.sources))],
        mergedFrom: documents.map(d => d.id),
        ...options.metadata
      }
    });

    return mergedDoc;
  },

  /**
   * Filter entries by criteria
   * @param {ReleaseNotesEntry[]} entries - Entries to filter
   * @param {Object} criteria - Filter criteria
   * @returns {ReleaseNotesEntry[]}
   */
  filterEntries(entries, criteria = {}) {
    return entries.filter(entry => {
      // Filter by category
      if (criteria.category && entry.category !== criteria.category) {
        return false;
      }

      // Filter by impact
      if (criteria.impact && entry.impact !== criteria.impact) {
        return false;
      }

      // Filter by minimum confidence
      if (criteria.minConfidence && entry.confidence < criteria.minConfidence) {
        return false;
      }

      // Filter by source
      if (criteria.source && entry.source !== criteria.source) {
        return false;
      }

      // Filter by review status
      if (criteria.reviewRequired !== undefined && 
          entry.metadata.reviewRequired !== criteria.reviewRequired) {
        return false;
      }

      return true;
    });
  },

  /**
   * Sort entries by criteria
   * @param {ReleaseNotesEntry[]} entries - Entries to sort
   * @param {Object} criteria - Sort criteria
   * @returns {ReleaseNotesEntry[]}
   */
  sortEntries(entries, criteria = {}) {
    const { by = 'confidence', order = 'desc' } = criteria;
    
    return [...entries].sort((a, b) => {
      let aValue, bValue;

      switch (by) {
        case 'confidence':
          aValue = a.confidence;
          bValue = b.confidence;
          break;
        case 'impact':
          const impactOrder = { high: 3, medium: 2, low: 1 };
          aValue = impactOrder[a.impact] || 0;
          bValue = impactOrder[b.impact] || 0;
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          if (order === 'asc') {
            return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
          } else {
            return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
          }
        case 'createdAt':
          aValue = new Date(a.metadata.createdAt);
          bValue = new Date(b.metadata.createdAt);
          break;
        default:
          return 0;
      }

      if (order === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }
};

export default {
  ReleaseNotesEntry,
  ReleaseNotesDocument,
  ValidationError,
  ReleaseNotesUtils
};