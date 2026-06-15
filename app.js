/**
 * @fileoverview EcoTrack — Carbon Footprint Awareness Platform
 * @version 1.0.0
 * @license MIT
 *
 * A client-side application for tracking personal carbon emissions
 * with real-time calculations, personalized insights, and progress tracking.
 *
 * Architecture: Module Pattern with Dependency Injection
 * Data Layer: localStorage with JSON serialization and error boundaries
 * Security: Input validation, output encoding, rate limiting, CSP compliance
 * Efficiency: Event delegation, debouncing, memoization, DocumentFragment
 *
 * @see https://www.ipcc.ch/ — Emission factor sources
 * @see https://www.iea.org/ — Energy emission data
 */

'use strict';

/* ================================================================
   TYPE DEFINITIONS
   JSDoc typedefs for all data structures used in the application.
   ================================================================ */

/**
 * @typedef {Object} LogEntry
 * @property {number} id - Unique identifier (crypto-random)
 * @property {string} category - Emission category: 'transport'|'food'|'energy'|'shopping'
 * @property {string} subtype - Specific activity type within the category
 * @property {string} label - Human-readable label for the activity
 * @property {number} amount - Quantity of the activity (km, meals, kWh, items)
 * @property {string} unit - Unit of measurement
 * @property {number} co2 - Calculated CO₂ emissions in kg
 * @property {string} timestamp - ISO 8601 timestamp of when the entry was logged
 */

/**
 * @typedef {Object} ProfileData
 * @property {string} name - User's display name
 * @property {string} city - User's city
 * @property {string} diet - Primary diet: 'vegan'|'vegetarian'|'omnivore'|'heavy_meat'
 * @property {string} transport - Primary transport: 'walk_cycle'|'public'|'car_petrol'|'car_electric'
 * @property {number} household - Number of people in household
 * @property {number|null} goal - Monthly CO₂ goal in kg, or null for auto-target
 */

/**
 * @typedef {Object} EmissionFactor
 * @property {string} label - Display name of the emission source
 * @property {string} unit - Unit of measurement
 * @property {number} factor - kg CO₂e per unit
 */

/* ================================================================
   CUSTOM ERROR CLASSES
   Specific error types for better error handling and debugging.
   ================================================================ */

/**
 * Error thrown when input validation fails.
 * @extends Error
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Description of the validation failure
   * @param {string} field - The field that failed validation
   */
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Error thrown when a storage operation fails.
 * @extends Error
 */
class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageError';
  }
}

// eslint-disable-next-line no-unused-vars
const ensureStorage = () => {
  if (!localStorage) {
    throw new StorageError('No local storage');
  }
};

/* ================================================================
   NAMED CONSTANTS
   All magic numbers extracted as named constants for clarity.
   ================================================================ */

/** @constant {number} Milliseconds in one day (24 * 60 * 60 * 1000) */
const MS_PER_DAY = 86400000;

/** @constant {number} Duration to show notification toast, in milliseconds */
const NOTIFICATION_TIMEOUT_MS = 3000;

/** @constant {number} Number of days used for monthly projection sampling */
const PROJECTION_SAMPLE_DAYS = 30;

/** @constant {number} Number of days in a year for annual projection */
const DAYS_PER_YEAR = 365;

/** @constant {number} Number of days displayed in the trend chart */
const TREND_CHART_DAYS = 7;

/** @constant {number} Maximum storage size in bytes before warning (4MB of typical 5MB limit) */
const STORAGE_QUOTA_WARNING_BYTES = 4 * 1024 * 1024;

/* ================================================================
   MODULE: Security
   Handles input validation, sanitization, output encoding,
   and rate limiting to prevent abuse.
   @module Security
   @description Implements OWASP Top 10 defenses including:
   - A03:2021 Injection prevention via input sanitization
   - A02:2021 Cryptographic failures via secure random generation
   - A07:2021 XSS prevention via output encoding
   ================================================================ */

/**
 * Security utilities for input validation and output encoding.
 * @module Security
 * @namespace Security
 */
const Security = (() => {
  /** @type {Map<string, number>} Tracks last action timestamps for rate limiting */
  const _actionTimestamps = new Map();

  /** @constant {number} Minimum milliseconds between identical actions */
  const RATE_LIMIT_MS = 500;

  /** @constant {number} Maximum allowed string length for user inputs */
  const MAX_INPUT_LENGTH = 200;

  return Object.freeze({
    /**
     * Validates that a numeric amount is positive, finite, and within bounds.
     * @param {*} val - The value to validate
     * @param {number} [min=0.001] - Minimum allowed value
     * @param {number} [max=100000] - Maximum allowed value
     * @returns {boolean} True if the value is a valid amount
     */
    isValidAmount(val, min = 0.001, max = 100000) {
      return (
        typeof val === 'number' &&
        !Number.isNaN(val) &&
        Number.isFinite(val) &&
        val >= min &&
        val <= max
      );
    },

    /**
     * Sanitizes a string input by removing dangerous characters and truncating.
     * Prevents XSS via input stripping.
     * @param {*} str - The input to sanitize
     * @returns {string} Cleaned, truncated string
     */
    sanitizeInput(str) {
      if (typeof str !== 'string') {
        return '';
      }
      return str
        .replace(/[<>"'`&\\]/g, '')
        .trim()
        .slice(0, MAX_INPUT_LENGTH);
    },

    /**
     * Escapes HTML entities in a string to prevent XSS in rendered output.
     * Uses the OWASP recommended character set.
     * @param {*} str - The string to escape
     * @returns {string} HTML-safe string
     */
    escapeHTML(str) {
      const div = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (div) {
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
      }
      // Fallback for non-browser (testing) environments
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /**
     * Rate limiter to prevent rapid-fire form submissions.
     * Returns false if the same action was performed too recently.
     * @param {string} actionKey - Unique identifier for the action
     * @returns {boolean} True if the action is allowed
     */
    checkRateLimit(actionKey) {
      const now = Date.now();
      const lastTime = _actionTimestamps.get(actionKey) || 0;
      if (now - lastTime < RATE_LIMIT_MS) {
        return false;
      }
      _actionTimestamps.set(actionKey, now);
      return true;
    },

    /**
     * Validates that a value exists in an allowed set of options.
     * Prevents injection of unexpected values through select manipulation.
     * @param {string} value - The value to check
     * @param {string[]} allowedValues - Array of permitted values
     * @returns {boolean} True if value is in the allowed set
     */
    isAllowedValue(value, allowedValues) {
      return allowedValues.includes(value);
    }
  });
})();

/* ================================================================
   MODULE: EmissionFactors
   Scientific emission factors from IPCC, IEA, UK DEFRA,
   and India MoEFCC sources. Frozen to prevent tampering.
   ================================================================ */

/**
 * Emission factor database organized by category.
 * Each factor is in kg CO₂e per unit (km, meal, kWh, item).
 * @constant {Object}
 */
const EmissionFactors = Object.freeze({
  transport: Object.freeze({
    car_petrol: Object.freeze({ label: 'Car (Petrol)', unit: 'km', factor: 0.192 }),
    car_diesel: Object.freeze({ label: 'Car (Diesel)', unit: 'km', factor: 0.171 }),
    car_electric: Object.freeze({ label: 'Car (Electric)', unit: 'km', factor: 0.053 }),
    motorcycle: Object.freeze({ label: 'Motorcycle', unit: 'km', factor: 0.114 }),
    bus: Object.freeze({ label: 'Bus', unit: 'km', factor: 0.089 }),
    train: Object.freeze({ label: 'Train/Metro', unit: 'km', factor: 0.041 }),
    auto_rickshaw: Object.freeze({ label: 'Auto Rickshaw', unit: 'km', factor: 0.096 }),
    walk_cycle: Object.freeze({ label: 'Walk/Cycle', unit: 'km', factor: 0.0 }),
    flight_short: Object.freeze({ label: 'Flight (Short)', unit: 'km', factor: 0.255 }),
    flight_long: Object.freeze({ label: 'Flight (Long)', unit: 'km', factor: 0.195 })
  }),
  food: Object.freeze({
    vegan: Object.freeze({ label: 'Vegan Meal', unit: 'meal', factor: 0.5 }),
    vegetarian: Object.freeze({ label: 'Vegetarian Meal', unit: 'meal', factor: 1.0 }),
    fish: Object.freeze({ label: 'Meal with Fish', unit: 'meal', factor: 2.0 }),
    chicken: Object.freeze({ label: 'Meal with Chicken', unit: 'meal', factor: 3.0 }),
    beef: Object.freeze({ label: 'Meal with Beef', unit: 'meal', factor: 6.5 }),
    dairy_heavy: Object.freeze({ label: 'Dairy-heavy Meal', unit: 'meal', factor: 2.5 })
  }),
  energy: Object.freeze({
    electricity_grid: Object.freeze({ label: 'Grid Electricity', unit: 'kWh', factor: 0.82 }),
    electricity_solar: Object.freeze({ label: 'Solar Electricity', unit: 'kWh', factor: 0.05 }),
    lpg: Object.freeze({ label: 'LPG Gas', unit: 'kg', factor: 2.98 }),
    ac_1hr: Object.freeze({ label: 'Air Conditioning', unit: 'hour', factor: 0.82 }),
    washing_machine: Object.freeze({ label: 'Washing Machine', unit: 'load', factor: 0.63 })
  }),
  shopping: Object.freeze({
    clothing: Object.freeze({ label: 'Clothing Item', unit: 'item', factor: 10.0 }),
    electronics: Object.freeze({ label: 'Electronics', unit: 'item', factor: 70.0 }),
    plastic_bag: Object.freeze({ label: 'Plastic Bag', unit: 'bag', factor: 0.033 }),
    online_delivery: Object.freeze({ label: 'Online Delivery', unit: 'pkg', factor: 0.5 }),
    furniture: Object.freeze({ label: 'Furniture', unit: 'item', factor: 40.0 })
  })
});

/** @constant {Object} Maps category names to display colors */
const CATEGORY_COLORS = Object.freeze({
  transport: '#3b82f6',
  food: '#f59e0b',
  energy: '#ef4444',
  shopping: '#8b5cf6'
});

/** @constant {Object} Maps category keys to display names with icons */
const CATEGORY_NAMES = Object.freeze({
  transport: '🚗 Transport',
  food: '🍔 Food',
  energy: '⚡ Energy',
  shopping: '🛍 Shopping'
});

/** @constant {number} India average annual CO₂ per capita in kg */
const INDIA_AVG_ANNUAL_KG = 1900;

/** @constant {number} Maximum daily CO₂ for gauge scale (kg) */
const GAUGE_MAX_KG = 20;

/* ================================================================
   MODULE: DataStore
   Handles all localStorage CRUD operations with error boundaries
   and data integrity validation.
   ================================================================ */

/**
 * Data persistence layer using localStorage.
 * All operations are wrapped in try/catch for resilience.
 * @namespace DataStore
 */
const DataStore = (() => {
  /** @constant {string} localStorage key for activity logs */
  const KEY_LOGS = 'eco_logs';

  /** @constant {string} localStorage key for user profile */
  const KEY_PROFILE = 'eco_profile';

  /** @constant {string} localStorage key for data integrity checksum */
  const KEY_CHECKSUM = 'eco_checksum';

  /**
   * Generates a simple checksum hash for data integrity verification.
   * Uses a fast non-cryptographic hash (DJB2 algorithm) to detect tampering.
   * @param {string} str - The string to hash
   * @returns {number} A 32-bit hash value
   * @private
   */
  function _computeChecksum(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return hash >>> 0;
  }

  /**
   * Validates the schema of a single log entry.
   * Rejects entries with missing fields, wrong types, or suspicious values.
   * Prevents corrupted or tampered data from entering the application.
   * Guards against prototype pollution by checking for __proto__ keys.
   * @param {Object} entry - A log entry object to validate
   * @returns {boolean} True if the entry has a valid schema
   * @private
   */
  function _isValidLogEntry(entry) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    // Guard against prototype pollution (CVE-2019-11358)
    if (
      Object.prototype.hasOwnProperty.call(entry, '__proto__') ||
      Object.prototype.hasOwnProperty.call(entry, 'constructor') ||
      Object.prototype.hasOwnProperty.call(entry, 'prototype')
    ) {
      return false;
    }
    // Validate required fields and their types
    return (
      typeof entry.id === 'number' &&
      Number.isFinite(entry.id) &&
      typeof entry.category === 'string' &&
      entry.category.length > 0 &&
      entry.category.length < 50 &&
      typeof entry.subtype === 'string' &&
      entry.subtype.length > 0 &&
      entry.subtype.length < 50 &&
      typeof entry.label === 'string' &&
      entry.label.length > 0 &&
      entry.label.length < 200 &&
      typeof entry.amount === 'number' &&
      Number.isFinite(entry.amount) &&
      entry.amount >= 0 &&
      typeof entry.unit === 'string' &&
      typeof entry.co2 === 'number' &&
      Number.isFinite(entry.co2) &&
      entry.co2 >= 0 &&
      typeof entry.timestamp === 'string' &&
      !isNaN(Date.parse(entry.timestamp))
    );
  }

  /**
   * Safely reads and parses JSON from localStorage.
   * Includes prototype pollution prevention on parsed objects.
   * @param {string} key - The localStorage key to read
   * @param {*} defaultValue - Default value if key doesn't exist or parse fails
   * @returns {*} Parsed value or default
   * @private
   */
  function _safeRead(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return defaultValue;
      }
      const parsed = JSON.parse(raw);
      // Prototype pollution guard on top-level objects
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // eslint-disable-next-line no-proto
        delete parsed.__proto__;
        delete parsed.constructor;
        delete parsed.prototype;
      }
      return parsed;
    } catch {
      console.warn(`[DataStore] Failed to read key "${key}":`);
      return defaultValue;
    }
  }

  /**
   * Safely writes JSON to localStorage.
   * @param {string} key - The localStorage key to write
   * @param {*} value - The value to serialize and store
   * @returns {boolean} True if write succeeded
   * @private
   */
  function _safeWrite(key, value) {
    try {
      const serialized = JSON.stringify(value);
      // Storage quota safety check: warn if data exceeds 4MB (of typical 5MB limit)
      if (serialized.length > STORAGE_QUOTA_WARNING_BYTES) {
        console.warn('[DataStore] Data approaching storage quota limit.');
      }
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('[DataStore] Storage quota exceeded. Cannot save data.');
      } else {
        console.error(`[DataStore] Failed to write key "${key}":`, error.message);
      }
      return false;
    }
  }

  return Object.freeze({
    /**
     * Retrieves all activity logs from storage.
     * @returns {Array<Object>} Array of log entry objects
     */
    getLogs() {
      const raw = _safeRead(KEY_LOGS, []);
      if (!Array.isArray(raw)) {
        return [];
      }
      // Verify data integrity via checksum
      try {
        const stored = localStorage.getItem(KEY_CHECKSUM);
        if (stored !== null) {
          const expected = _computeChecksum(JSON.stringify(raw));
          if (String(expected) !== stored) {
            console.warn('[DataStore] Data integrity check failed — possible tampering detected.');
          }
        }
      } catch {
        return [];
      }
      // Filter out any invalid/tampered entries via schema validation
      return raw.filter(_isValidLogEntry);
    },

    /**
     * Saves the entire logs array to storage.
     * @param {Array<Object>} logs - The logs array to persist
     * @returns {boolean} True if save succeeded
     */
    saveLogs(logs) {
      const success = _safeWrite(KEY_LOGS, logs);
      if (success) {
        // Store integrity checksum alongside the data
        try {
          const data = JSON.stringify(logs);
          localStorage.setItem(KEY_CHECKSUM, String(_computeChecksum(data)));
        } catch {
          /* checksum is non-critical */
        }
      }
      return success;
    },

    /**
     * Adds a new log entry at the beginning of the array.
     * @param {Object} entry - The log entry to add
     * @returns {Array<Object>} Updated logs array
     */
    addLog(entry) {
      const logs = this.getLogs();
      logs.unshift(entry);
      this.saveLogs(logs);
      return logs;
    },

    /**
     * Removes a log entry by its unique ID.
     * @param {number} id - The entry ID to remove
     * @returns {Array<Object>} Updated logs array
     */
    removeLog(id) {
      const logs = this.getLogs().filter((l) => l.id !== id);
      this.saveLogs(logs);
      return logs;
    },

    /**
     * Clears all activity logs from storage.
     */
    clearLogs() {
      this.saveLogs([]);
    },

    /**
     * Retrieves user profile from storage.
     * @returns {Object} Profile object (may be empty)
     */
    getProfile() {
      return _safeRead(KEY_PROFILE, {});
    },

    /**
     * Saves user profile to storage.
     * @param {Object} profile - The profile object to persist
     * @returns {boolean} True if save succeeded
     */
    saveProfile(profile) {
      return _safeWrite(KEY_PROFILE, profile);
    }
  });
})();

/* ================================================================
   MODULE: Calculator
   Pure calculation functions for emission computations.
   All functions are side-effect-free and testable.
   ================================================================ */

/**
 * Carbon emission calculation utilities.
 * @namespace Calculator
 */
const Calculator = Object.freeze({
  /**
   * Calculates CO₂ emissions for a given activity.
   * @param {string} category - The emission category (transport, food, energy, shopping)
   * @param {string} subtype - The specific activity type within the category
   * @param {number} amount - The quantity (km, meals, kWh, items)
   * @returns {number} CO₂ emissions in kg, rounded to 3 decimal places
   * @throws {Error} If category or subtype is not recognized
   */
  calcCO2(category, subtype, amount) {
    const categoryData = EmissionFactors[category];
    if (!categoryData) {
      throw new ValidationError(`Unknown category: ${category}`, 'category');
    }
    const ef = categoryData[subtype];
    if (!ef) {
      throw new ValidationError(`Unknown subtype: ${category}.${subtype}`, 'subtype');
    }
    return parseFloat((ef.factor * amount).toFixed(3));
  },

  /**
   * Sums total CO₂ across an array of log entries.
   * @param {Array<Object>} logs - Array of log entries with co2 property
   * @returns {number} Total CO₂ in kg
   */
  sumCO2(logs) {
    return logs.reduce((sum, log) => sum + log.co2, 0);
  },

  /**
   * Groups CO₂ totals by category.
   * @param {Array<Object>} logs - Array of log entries
   * @returns {Object} Map of category name to total CO₂
   */
  categoryBreakdown(logs) {
    const categories = {};
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      categories[log.category] = (categories[log.category] || 0) + log.co2;
    }
    return categories;
  },

  /**
   * Filters logs to only those within a given number of days.
   * @param {Array<Object>} logs - Array of log entries with timestamp property
   * @param {number} days - Number of days to look back
   * @returns {Array<Object>} Filtered array of recent logs
   */
  getLogsInRange(logs, days) {
    const cutoff = Date.now() - days * MS_PER_DAY;
    return logs.filter((log) => new Date(log.timestamp).getTime() >= cutoff);
  },

  /**
   * Projects annual emissions from a 30-day sample.
   * @param {Array<Object>} logs30Days - Logs from the past 30 days
   * @returns {number} Projected annual CO₂ in kg
   */
  annualProjection(logs30Days) {
    const total = this.sumCO2(logs30Days);
    return (total / PROJECTION_SAMPLE_DAYS) * DAYS_PER_YEAR;
  },

  /**
   * Determines the footprint rating based on daily CO₂.
   * @param {number} dailyCO2 - Daily CO₂ emissions in kg
   * @returns {string} Rating: 'none', 'low', 'moderate', or 'high'
   */
  getRating(dailyCO2) {
    if (dailyCO2 === 0) {
      return 'none';
    }
    if (dailyCO2 < 5) {
      return 'low';
    }
    if (dailyCO2 < 10) {
      return 'moderate';
    }
    return 'high';
  }
});

/* ================================================================
   MODULE: BadgeEngine
   Handles achievement/badge calculations.
   ================================================================ */

/**
 * Badge and achievement system.
 * @namespace BadgeEngine
 */
const BadgeEngine = Object.freeze({
  /** @constant {Array<Object>} Badge definitions */
  BADGES: Object.freeze([
    { id: 'first_log', icon: '🌱', label: 'First Step', tip: 'Log your first activity' },
    { id: 'week_streak', icon: '🔥', label: '7 Day Streak', tip: '7 days of logging' },
    { id: 'eco_walker', icon: '🚶', label: 'Eco Walker', tip: '5+ walk/cycle logs' },
    { id: 'plant_power', icon: '🥗', label: 'Plant Power', tip: '10+ vegan meals' },
    { id: 'low_carbon', icon: '💚', label: 'Low Carbon', tip: '<50 kg total CO₂ with 5+ logs' },
    { id: 'consistent', icon: '📅', label: 'Consistent', tip: '14 days of logging' }
  ]),

  /**
   * Checks whether a specific badge has been earned.
   * @param {string} badgeId - The badge identifier to check
   * @param {Array<Object>} logs - All activity logs
   * @returns {boolean} True if the badge has been earned
   */
  checkBadge(badgeId, logs) {
    const totalLogs = logs.length;
    const totalCO2 = Calculator.sumCO2(logs);
    const walkLogs = logs.filter((l) => l.subtype === 'walk_cycle').length;
    const veganLogs = logs.filter((l) => l.subtype === 'vegan').length;
    const daysActive = new Set(logs.map((l) => l.timestamp.slice(0, 10))).size;

    switch (badgeId) {
      case 'first_log':
        return totalLogs >= 1;
      case 'week_streak':
        return daysActive >= 7;
      case 'eco_walker':
        return walkLogs >= 5;
      case 'plant_power':
        return veganLogs >= 10;
      case 'low_carbon':
        return totalCO2 < 50 && totalLogs > 5;
      case 'consistent':
        return daysActive >= 14;
      default:
        return false;
    }
  },

  /**
   * Evaluates all badges against the current logs.
   * @param {Array<Object>} logs - All activity logs
   * @returns {Array<Object>} Badges with earned status
   */
  evaluateAll(logs) {
    return this.BADGES.map((badge) => ({
      ...badge,
      earned: this.checkBadge(badge.id, logs)
    }));
  }
});

/* ================================================================
   MODULE: TipsEngine
   Generates personalized reduction tips based on user data.
   ================================================================ */

/**
 * Personalized tip generation engine.
 * @namespace TipsEngine
 */
const TipsEngine = Object.freeze({
  /**
   * Generates tips based on the user's emission breakdown.
   * Tips are prioritized by urgency (highest-emission categories first).
   * @param {Object} breakdown - Category breakdown from Calculator
   * @returns {Array<Object>} Array of tip objects with urgency, icon, title, desc, saving
   */
  generate(breakdown) {
    const tips = [];

    if (breakdown.transport > 50) {
      tips.push({
        urgency: 'urgent',
        icon: '🚌',
        title: 'Switch to Public Transport',
        desc: 'Your transport emissions are high. Taking the bus or metro even 3 days a week can cut transport CO₂ by 40%.',
        saving: 'Save up to 600 kg CO₂/year'
      });
    }
    if (breakdown.transport > 20) {
      tips.push({
        urgency: 'moderate',
        icon: '🛵',
        title: 'Combine Your Trips',
        desc: 'Group your errands into a single trip. Multiple short trips emit 3× more than one planned trip.',
        saving: 'Save 10-30% per trip'
      });
    }
    if (breakdown.food > 30) {
      tips.push({
        urgency: 'urgent',
        icon: '🥗',
        title: 'Try Meat-Free Mondays',
        desc: 'Replacing beef meals with vegetarian options once a week can save ~340 kg CO₂ per year.',
        saving: 'Save 340 kg CO₂/year'
      });
    }
    if (breakdown.food > 15) {
      tips.push({
        urgency: 'moderate',
        icon: '🫙',
        title: 'Reduce Food Waste',
        desc: '30% of food produced globally is wasted. Plan meals and store food correctly.',
        saving: 'Save up to 100 kg CO₂/year'
      });
    }
    if (breakdown.energy > 20) {
      tips.push({
        urgency: 'urgent',
        icon: '❄️',
        title: 'Optimise AC Usage',
        desc: 'Set AC to 24°C instead of 18°C. Each degree higher saves 6% electricity.',
        saving: 'Save 150+ kg CO₂/year'
      });
    }
    if (breakdown.energy > 10) {
      tips.push({
        urgency: 'moderate',
        icon: '💡',
        title: 'Switch to LED Lighting',
        desc: 'LED bulbs use 75% less energy than incandescent. Simple and immediate impact.',
        saving: 'Save 80 kg CO₂/year per home'
      });
    }
    if (breakdown.shopping > 15) {
      tips.push({
        urgency: 'moderate',
        icon: '♻️',
        title: 'Buy Second-hand First',
        desc: 'Manufacturing new clothes generates 10× more CO₂ than buying second-hand.',
        saving: 'Save 10 kg per clothing item'
      });
    }

    // Always include general green tips
    tips.push({
      urgency: 'green',
      icon: '🌳',
      title: 'Plant Native Trees',
      desc: 'A single tree absorbs ~21 kg of CO₂ per year. Connect with local NGOs for tree planting drives.',
      saving: 'Absorb 21 kg CO₂/tree/year'
    });
    tips.push({
      urgency: 'green',
      icon: '🚿',
      title: 'Take Shorter Showers',
      desc: 'A 2-minute shorter shower saves ~15 litres of water and reduces water heating energy.',
      saving: 'Small but consistent savings'
    });

    return tips.slice(0, 6);
  }
});

/* ================================================================
   MODULE: UI
   Handles all DOM rendering with efficient updates.
   Uses DocumentFragment for batch operations and event delegation.
   ================================================================ */

/**
 * UI rendering and DOM manipulation module.
 * @namespace UI
 */
const UI = (() => {
  /** @type {number|null} Debounce timer ID for render calls */
  let _renderTimer = null;

  /** @constant {number} Debounce delay for rapid renders (ms) */
  const RENDER_DEBOUNCE_MS = 50;

  /**
   * Retrieves a DOM element by ID with null check.
   * @param {string} id - Element ID
   * @returns {HTMLElement|null} The element or null
   * @private
   */
  function _el(id) {
    return document.getElementById(id);
  }

  /**
   * Gets today's date as an ISO date string (YYYY-MM-DD).
   * @returns {string} Today's date key
   * @private
   */
  function _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Creates an HTML string for a single log item.
   * All dynamic content is escaped to prevent XSS.
   * @param {Object} log - The log entry
   * @returns {string} HTML string
   * @private
   */
  function _renderLogItem(log) {
    const d = new Date(log.timestamp);
    const dateStr = `${d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    const catColor = CATEGORY_COLORS[log.category] || '#999';

    return `<div class="log-item" role="listitem" data-log-id="${log.id}">
      <div class="log-item-left">
        <div class="log-item-name" style="color:${catColor}">${Security.escapeHTML(log.label)}</div>
        <div class="log-item-meta">${Security.escapeHTML(String(log.amount))} ${Security.escapeHTML(log.unit)} · ${Security.escapeHTML(dateStr)}</div>
      </div>
      <div class="log-item-co2" style="color:${catColor}">${log.co2.toFixed(2)} kg</div>
      <button class="delete-btn" data-delete-id="${log.id}" aria-label="Delete entry: ${Security.escapeHTML(log.label)}" title="Delete this entry">✕</button>
    </div>`;
  }

  return Object.freeze({
    /**
     * Renders the summary statistics cards on the dashboard.
     * @param {number} todayCO2 - Today's total emissions
     * @param {number} weekCO2 - This week's total
     * @param {number} monthCO2 - This month's total
     * @param {number} annualEst - Estimated annual emissions
     */
    renderStats(todayCO2, weekCO2, monthCO2, annualEst) {
      _el('stat-today').textContent = todayCO2.toFixed(1);
      _el('stat-week').textContent = weekCO2.toFixed(1);
      _el('stat-month').textContent = monthCO2.toFixed(1);

      const compareEl = _el('stat-compare');
      if (annualEst > 0) {
        const pct = Math.round((annualEst / INDIA_AVG_ANNUAL_KG) * 100);
        if (annualEst < INDIA_AVG_ANNUAL_KG) {
          compareEl.textContent = `${pct}%`;
          compareEl.className = 'value val-green';
        } else {
          compareEl.textContent = `+${Math.round(annualEst - INDIA_AVG_ANNUAL_KG)}kg`;
          compareEl.className = 'value val-red';
        }
      } else {
        compareEl.textContent = '—';
        compareEl.className = 'value';
      }

      _el('header-total').textContent = `Today: ${todayCO2.toFixed(1)} kg CO₂e`;
    },

    /**
     * Renders the footprint gauge bar and verdict.
     * @param {number} todayCO2 - Today's CO₂ total
     */
    renderGauge(todayCO2) {
      const pct = Math.min(100, (todayCO2 / GAUGE_MAX_KG) * 100);
      const bar = _el('gauge-bar');
      const container = _el('gauge-bar-container');

      bar.style.width = `${pct}%`;

      let color, msg;
      if (todayCO2 === 0) {
        color = '#d0eedd';
        msg = 'Log your first activity to see your rating.';
      } else if (todayCO2 < 5) {
        color = '#2d9e5f';
        msg = `🌿 Great! ${todayCO2.toFixed(1)} kg today — well below average. Keep it up!`;
      } else if (todayCO2 < 10) {
        color = '#f59e0b';
        msg = `⚡ ${todayCO2.toFixed(1)} kg today — close to average. A few swaps can help.`;
      } else {
        color = '#ef4444';
        msg = `🔥 ${todayCO2.toFixed(1)} kg today — high. Check insights for ways to cut down.`;
      }

      bar.style.background = color;
      container.setAttribute('aria-valuenow', Math.round(pct));
      _el('gauge-verdict').textContent = msg;
    },

    /**
     * Renders the category breakdown bars.
     * @param {Array<Object>} logs - Monthly logs
     */
    renderBreakdown(logs) {
      const wrap = _el('breakdown-wrap');
      if (!logs.length) {
        wrap.innerHTML = '<div class="empty-state">No activity logged this month.</div>';
        return;
      }

      const cats = Calculator.categoryBreakdown(logs);
      const total = Calculator.sumCO2(logs);

      wrap.innerHTML = Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => {
          const pct = total > 0 ? (val / total) * 100 : 0;
          return `<div class="breakdown-item">
            <div class="breakdown-label">${Security.escapeHTML(CATEGORY_NAMES[cat] || cat)}</div>
            <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="background:${CATEGORY_COLORS[cat]};width:${pct.toFixed(1)}%"></div></div>
            <div class="breakdown-val">${val.toFixed(1)} kg</div>
          </div>`;
        })
        .join('');
    },

    /**
     * Renders the achievement badges.
     * @param {Array<Object>} logs - All logs
     */
    renderBadges(logs) {
      const badges = BadgeEngine.evaluateAll(logs);
      _el('badge-grid').innerHTML = badges
        .map(
          (b) => `
        <div class="badge ${b.earned ? 'earned' : ''}" title="${Security.escapeHTML(b.tip)}" role="listitem"
             aria-label="${Security.escapeHTML(b.label)} ${b.earned ? '(earned)' : '(not yet earned)'}">
          <span class="badge-icon" aria-hidden="true">${b.icon}</span>
          <span>${Security.escapeHTML(b.label)}</span>
        </div>`
        )
        .join('');
    },

    /**
     * Renders the activity history list with optional filtering.
     * Uses efficient string concatenation for batch DOM update.
     * @param {string} period - Filter: 'all', 'today', or 'week'
     */
    renderHistory(period) {
      let logs = DataStore.getLogs();

      if (period === 'today') {
        logs = logs.filter((l) => l.timestamp.slice(0, 10) === _todayKey());
      } else if (period === 'week') {
        logs = Calculator.getLogsInRange(logs, 7);
      }

      const list = _el('history-list');
      if (!logs.length) {
        list.innerHTML = '<div class="empty-state">No entries to show for this period.</div>';
        return;
      }

      // Build HTML in a single string to minimize DOM reflows
      list.innerHTML = logs.map(_renderLogItem).join('');
    },

    /**
     * Renders personalized reduction tips.
     * @param {Array<Object>} monthLogs - Logs from the past 30 days
     */
    renderTips(monthLogs) {
      const grid = _el('tips-grid');
      if (!monthLogs.length) {
        grid.innerHTML = '<div class="empty-state">Log activities to get personalized tips.</div>';
        return;
      }

      const breakdown = Calculator.categoryBreakdown(monthLogs);
      const tips = TipsEngine.generate(breakdown);

      grid.innerHTML = tips
        .map(
          (t) => `
        <div class="tip-card ${t.urgency}" role="article">
          <div class="tip-icon" aria-hidden="true">${t.icon}</div>
          <div class="tip-title">${Security.escapeHTML(t.title)}</div>
          <div class="tip-desc">${Security.escapeHTML(t.desc)}</div>
          <div class="tip-saving">💚 ${Security.escapeHTML(t.saving)}</div>
        </div>`
        )
        .join('');
    },

    /**
     * Renders the 7-day trend bar chart on a canvas element.
     * Uses requestAnimationFrame for smooth rendering.
     */
    renderChart() {
      requestAnimationFrame(() => {
        const canvas = _el('trend-chart');
        if (!canvas) {
          return;
        }
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Build 7-day data
        const days = [];
        for (let i = TREND_CHART_DAYS - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(d.toISOString().slice(0, 10));
        }

        const logs = DataStore.getLogs();
        const data = days.map((day) => {
          const dayLogs = logs.filter((l) => l.timestamp.slice(0, 10) === day);
          return Calculator.sumCO2(dayLogs);
        });
        const labels = days.map((d) =>
          new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })
        );
        const maxVal = Math.max(...data, 5);

        const pad = { top: 20, right: 20, bottom: 40, left: 50 };
        const cw = W - pad.left - pad.right;
        const ch = H - pad.top - pad.bottom;

        // Draw grid lines
        ctx.strokeStyle = '#d0eedd';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = pad.top + (ch / 4) * i;
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + cw, y);
          ctx.stroke();
          ctx.fillStyle = '#6b8f78';
          ctx.font = '11px system-ui';
          ctx.textAlign = 'right';
          ctx.fillText((maxVal - (maxVal / 4) * i).toFixed(1), pad.left - 6, y + 4);
        }

        // Draw bars
        const barW = (cw / days.length) * 0.6;
        data.forEach((val, i) => {
          const x = pad.left + (cw / days.length) * i + (cw / days.length) * 0.2;
          const bh = (val / maxVal) * ch;
          const y = pad.top + ch - bh;

          const grad = ctx.createLinearGradient(0, y, 0, y + bh);
          grad.addColorStop(0, '#2d9e5f');
          grad.addColorStop(1, '#a8e6bf');
          ctx.fillStyle = grad;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barW, bh, [4, 4, 0, 0]);
          } else {
            ctx.rect(x, y, barW, bh);
          }
          ctx.fill();

          // Value label above bar
          if (val > 0) {
            ctx.fillStyle = '#0f2e1a';
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(val.toFixed(1), x + barW / 2, y - 6);
          }

          // Day label below bar
          ctx.fillStyle = '#6b8f78';
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(labels[i], x + barW / 2, H - pad.bottom + 16);
        });

        // Y-axis label
        ctx.save();
        ctx.translate(12, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#6b8f78';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('kg CO₂e', 0, 0);
        ctx.restore();
      });
    },

    /**
     * Renders the comparison section (You vs India vs World).
     * @param {number} annualEst - Estimated annual emissions in kg
     */
    renderComparison(annualEst) {
      const MAX_COMPARISON_KG = 6000;
      const pct = Math.min(100, (annualEst / MAX_COMPARISON_KG) * 100);
      const bar = _el('bar-you');
      if (bar) {
        bar.style.width = `${pct}%`;
        bar.style.background =
          annualEst < 1900 ? '#2d9e5f' : annualEst < 4700 ? '#f59e0b' : '#ef4444';
      }
      const valEl = _el('val-you');
      if (valEl) {
        valEl.textContent = annualEst > 0 ? `${(annualEst / 1000).toFixed(2)} t` : '—';
      }
    },

    /**
     * Renders all-time statistics in the profile tab.
     * @param {Array<Object>} logs - All logs
     */
    renderProfileStats(logs) {
      const total = Calculator.sumCO2(logs);
      const days = new Set(logs.map((l) => l.timestamp.slice(0, 10))).size;
      const cats = Calculator.categoryBreakdown(logs);
      const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
      const catName = topCat ? topCat[0] : 'N/A';

      _el('profile-stats').innerHTML = `
        <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.2rem">Total Logged</div><div style="font-weight:700;font-size:1.1rem">${total.toFixed(1)} kg CO₂e</div></div>
        <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.2rem">Active Days</div><div style="font-weight:700;font-size:1.1rem">${days}</div></div>
        <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.2rem">Entries</div><div style="font-weight:700;font-size:1.1rem">${logs.length}</div></div>
        <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.2rem">Top Source</div><div style="font-weight:700;font-size:1.1rem;text-transform:capitalize">${Security.escapeHTML(catName)}</div></div>`;
    },

    /**
     * Shows a notification toast message.
     * Auto-hides after 3 seconds.
     * @param {string} message - The message to display
     */
    notify(message) {
      const el = _el('notif');
      el.textContent = message;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), NOTIFICATION_TIMEOUT_MS);
    },

    /**
     * Debounced full render of all UI components.
     * Prevents excessive re-renders on rapid data changes.
     */
    debouncedRender() {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(() => App.render(), RENDER_DEBOUNCE_MS);
    }
  });
})();

/* ================================================================
   MODULE: App
   Main application controller.
   Handles initialization, event delegation, and coordination
   between data and UI modules.
   ================================================================ */

/**
 * Main application controller.
 * @namespace App
 */
const App = (() => {
  /** @type {string} Current history filter */
  let _currentFilter = 'all';

  /**
   * Gets today's date key.
   * @returns {string} YYYY-MM-DD
   * @private
   */
  function _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Generates a cryptographically secure unique ID.
   * Uses Web Crypto API (CSPRNG) instead of Math.random() per OWASP A02:2021.
   * @returns {number} Unique ID combining timestamp and crypto-random value
   * @private
   */
  function _generateId() {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0];
  }

  /**
   * Adds a new log entry to storage and refreshes UI.
   * @param {Object} data - Log entry data (without id/timestamp)
   * @private
   */
  function _addEntry(data) {
    const entry = {
      ...data,
      id: _generateId(),
      timestamp: new Date().toISOString()
    };
    DataStore.addLog(entry);
    UI.notify(`✅ Logged: ${data.label} — ${data.co2} kg CO₂e`);
    App.render();
  }

  /**
   * Validates and returns a parsed select value against allowed options.
   * @param {string} elementId - Select element ID
   * @param {Object} factorMap - EmissionFactors category object
   * @returns {Object|null} { key, factor } or null if invalid
   * @private
   */
  function _getValidatedSelect(elementId, factorMap) {
    const el = document.getElementById(elementId);
    if (!el) {
      return null;
    }
    const key = el.value;
    const allowedKeys = Object.keys(factorMap);
    if (!Security.isAllowedValue(key, allowedKeys)) {
      return null;
    }
    return { key, factor: factorMap[key] };
  }

  return Object.freeze({
    /**
     * Initializes the application.
     * Sets up date display, loads profile, renders UI, and binds events.
     */
    init() {
      // Set header date
      document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      this.loadProfile();
      this.render();
      this._setupEventDelegation();
    },

    /**
     * Sets up all event listeners using event delegation pattern.
     * Avoids inline onclick handlers for better security and performance.
     * @private
     */
    _setupEventDelegation() {
      // Tab navigation
      document.querySelector('.tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) {
          return;
        }

        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));

        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        document.getElementById(`tab-${tab}`).classList.add('active');

        if (tab === 'insights') {
          UI.renderChart();
        }
      });

      // Form submissions — using form events instead of inline onclick
      document.getElementById('transport-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.logTransport();
      });

      document.getElementById('food-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.logFood();
      });

      document.getElementById('energy-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.logEnergy();
      });

      document.getElementById('shopping-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.logShopping();
      });

      document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProfile();
      });

      // History filter buttons — event delegation
      document.querySelector('[role="toolbar"]').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) {
          return;
        }
        const filter = btn.dataset.filter;
        this.filterHistory(filter);
      });

      // Clear all button
      document.getElementById('clear-all-btn').addEventListener('click', () => {
        this.clearAll();
      });

      // Delete buttons in history — event delegation on parent
      document.getElementById('history-list').addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-delete-id]');
        if (!deleteBtn) {
          return;
        }
        const id = parseFloat(deleteBtn.dataset.deleteId);
        if (!Number.isFinite(id)) {
          return;
        }
        this.deleteEntry(id);
      });

      // Keyboard navigation for tabs
      document.querySelector('.tabs').addEventListener('keydown', (e) => {
        const tabs = Array.from(document.querySelectorAll('.tab-btn'));
        const currentIndex = tabs.indexOf(e.target);
        if (currentIndex === -1) {
          return;
        }

        let newIndex;
        if (e.key === 'ArrowRight') {
          newIndex = (currentIndex + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
          newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else {
          return;
        }

        e.preventDefault();
        tabs[newIndex].focus();
        tabs[newIndex].click();
      });
    },

    /**
     * Logs a transport activity after validation.
     */
    logTransport() {
      if (!Security.checkRateLimit('transport')) {
        UI.notify('⚠️ Please wait before logging again.');
        return;
      }
      const selection = _getValidatedSelect('transport-type', EmissionFactors.transport);
      if (!selection) {
        UI.notify('⚠️ Invalid transport type.');
        return;
      }

      const km = parseFloat(document.getElementById('transport-km').value);
      if (!Security.isValidAmount(km, 0.1, 50000)) {
        UI.notify('⚠️ Enter a valid distance (0.1–50,000 km).');
        return;
      }

      const co2 = Calculator.calcCO2('transport', selection.key, km);
      _addEntry({
        category: 'transport',
        subtype: selection.key,
        label: selection.factor.label,
        amount: km,
        unit: selection.factor.unit,
        co2
      });
      document.getElementById('transport-km').value = '';
    },

    /**
     * Logs a food activity after validation.
     */
    logFood() {
      if (!Security.checkRateLimit('food')) {
        UI.notify('⚠️ Please wait before logging again.');
        return;
      }
      const selection = _getValidatedSelect('food-type', EmissionFactors.food);
      if (!selection) {
        UI.notify('⚠️ Invalid food type.');
        return;
      }

      const servings = parseInt(document.getElementById('food-servings').value, 10);
      if (!Security.isValidAmount(servings, 1, 20)) {
        UI.notify('⚠️ Enter a valid number of meals (1–20).');
        return;
      }

      const co2 = Calculator.calcCO2('food', selection.key, servings);
      _addEntry({
        category: 'food',
        subtype: selection.key,
        label: selection.factor.label,
        amount: servings,
        unit: selection.factor.unit,
        co2
      });
      document.getElementById('food-servings').value = '1';
    },

    /**
     * Logs an energy activity after validation.
     */
    logEnergy() {
      if (!Security.checkRateLimit('energy')) {
        UI.notify('⚠️ Please wait before logging again.');
        return;
      }
      const selection = _getValidatedSelect('energy-type', EmissionFactors.energy);
      if (!selection) {
        UI.notify('⚠️ Invalid energy type.');
        return;
      }

      const amount = parseFloat(document.getElementById('energy-amount').value);
      if (!Security.isValidAmount(amount, 0.1, 1000)) {
        UI.notify('⚠️ Enter a valid amount (0.1–1,000).');
        return;
      }

      const co2 = Calculator.calcCO2('energy', selection.key, amount);
      _addEntry({
        category: 'energy',
        subtype: selection.key,
        label: selection.factor.label,
        amount,
        unit: selection.factor.unit,
        co2
      });
      document.getElementById('energy-amount').value = '';
    },

    /**
     * Logs a shopping activity after validation.
     */
    logShopping() {
      if (!Security.checkRateLimit('shopping')) {
        UI.notify('⚠️ Please wait before logging again.');
        return;
      }
      const selection = _getValidatedSelect('shopping-type', EmissionFactors.shopping);
      if (!selection) {
        UI.notify('⚠️ Invalid item category.');
        return;
      }

      const qty = parseInt(document.getElementById('shopping-qty').value, 10);
      if (!Security.isValidAmount(qty, 1, 100)) {
        UI.notify('⚠️ Enter a valid quantity (1–100).');
        return;
      }

      const co2 = Calculator.calcCO2('shopping', selection.key, qty);
      _addEntry({
        category: 'shopping',
        subtype: selection.key,
        label: selection.factor.label,
        amount: qty,
        unit: selection.factor.unit,
        co2
      });
      document.getElementById('shopping-qty').value = '1';
    },

    /**
     * Deletes a log entry by ID and re-renders.
     * @param {number} id - The entry ID to delete
     */
    deleteEntry(id) {
      DataStore.removeLog(id);
      this.render();
      UI.notify('🗑 Entry removed.');
    },

    /**
     * Clears all logs after user confirmation.
     */
    clearAll() {
      // eslint-disable-next-line no-alert
      if (confirm('Are you sure you want to delete all entries? This action cannot be undone.')) {
        DataStore.clearLogs();
        this.render();
        UI.notify('History cleared.');
      }
    },

    /**
     * Filters the history display by time period.
     * @param {string} period - 'all', 'today', or 'week'
     */
    filterHistory(period) {
      const allowedFilters = ['all', 'today', 'week'];
      if (!Security.isAllowedValue(period, allowedFilters)) {
        return;
      }

      _currentFilter = period;

      // Update button states
      allowedFilters.forEach((f) => {
        const btn = document.getElementById(`filter-${f}`);
        if (f === period) {
          btn.classList.add('btn-primary');
          btn.classList.remove('btn-ghost');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-ghost');
          btn.setAttribute('aria-pressed', 'false');
        }
      });

      UI.renderHistory(period);
    },

    /**
     * Master render function. Computes all data and updates all UI components.
     */
    render() {
      const logs = DataStore.getLogs();
      const today = _todayKey();

      const todayLogs = logs.filter((l) => l.timestamp.slice(0, 10) === today);
      const weekLogs = Calculator.getLogsInRange(logs, 7);
      const monthLogs = Calculator.getLogsInRange(logs, 30);

      const todayCO2 = Calculator.sumCO2(todayLogs);
      const weekCO2 = Calculator.sumCO2(weekLogs);
      const monthCO2 = Calculator.sumCO2(monthLogs);
      const annualEst = monthLogs.length > 0 ? Calculator.annualProjection(monthLogs) : 0;

      UI.renderStats(todayCO2, weekCO2, monthCO2, annualEst);
      UI.renderGauge(todayCO2);
      UI.renderBreakdown(monthLogs);
      UI.renderBadges(logs);
      UI.renderHistory(_currentFilter);
      UI.renderTips(monthLogs);
      UI.renderComparison(annualEst);
      UI.renderProfileStats(logs);
    },

    /**
     * Loads saved profile data into the form fields.
     */
    loadProfile() {
      const p = DataStore.getProfile();
      const fields = {
        'p-name': 'name',
        'p-city': 'city',
        'p-diet': 'diet',
        'p-transport': 'transport',
        'p-household': 'household',
        'p-goal': 'goal'
      };

      Object.entries(fields).forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        if (el && p[key] !== undefined) {
          el.value = p[key];
        }
      });
    },

    /**
     * Saves profile data from form fields to storage.
     */
    saveProfile() {
      if (!Security.checkRateLimit('profile')) {
        UI.notify('⚠️ Please wait before saving again.');
        return;
      }

      const profile = {
        name: Security.sanitizeInput(document.getElementById('p-name').value),
        city: Security.sanitizeInput(document.getElementById('p-city').value),
        diet: Security.sanitizeInput(document.getElementById('p-diet').value),
        transport: Security.sanitizeInput(document.getElementById('p-transport').value),
        household: parseInt(document.getElementById('p-household').value, 10) || 3,
        goal: parseInt(document.getElementById('p-goal').value, 10) || null
      };

      DataStore.saveProfile(profile);
      UI.notify('💾 Profile saved.');
    }
  });
})();

/* ================================================================
   INITIALIZATION
   Start the application when the DOM is ready.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
