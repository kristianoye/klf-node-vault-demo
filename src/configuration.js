/*
 * KLF configuration type for NodeJS Express
 * Written by Kristian Oye
 * August 1, 2024
 */
const
    { readFile } = require('node:fs/promises'),
    path = require('node:path'),
    fs = require('node:fs'),
    EventEmitter = require('events').EventEmitter,
    express = require('express');

class Configuration extends EventEmitter {
    /**
     * 
     * @param {{ rootDirectory: string, configFile: string }} configSettings
     * @param {Object.<string,any>} configData The configuration data from the file
     */
    constructor({ rootDirectory, configFile } = configSettings, configData = {}) {
        super();

        this.#configData = configData;
        this.#configFile = configFile;
        this.#rootDirectory = rootDirectory;
    }

    // #region Private Properties

    /**
     * The actual configuration data
     * @type {Object.<string,any>}
     */
    #configData;

    /**
     * @type {string}
     */
    #configFile;

    /**
     * @type {string}
     */
    #rootDirectory;

    // #endregion

    // #region Public Properties

    // Read-only access
    get configFile() { return this.#configFile }

    // Read-only access
    get rootDirectory() { return this.#rootDirectory }

    // #endregion

    /**
     * Fetch a configuration value
     * @param {string} fullKey The value to fetch
     * @param {any} defaultValue A default value... if any
     * @returns 
     */
    getValue(fullKey, defaultValue = undefined) {
        let parts = fullKey.split('.').filter(s => s.length > 0),
            node = this.#configData;

        for (let i = 0, max = parts.length, lastIndex = max - 1; i < max; i++) {
            if (i === lastIndex) {
                if (parts[i] in node)
                    return node[parts[i]];
                else if (typeof defaultValue === 'undefined')
                    return defaultValue;
                else
                    return (node[parts[i]] = defaultValue);
            }
            else {
                if (parts[i] in node)
                    node = node[parts[i]];
                else
                    node = node[parts[i]] = {};
            }
        }
    }

    /**
     * 
     * @param {string} fullKey The key used to store the value
     * @param {*} value The value to associate with the key
     * @returns 
     */
    setValue(fullKey, value) {
        let parts = fullKey.split('.').filter(s => s.length > 0),
            node = this.#configData;

        for (let i = 0, max = parts.length, lastIndex = max - 1; i < max; i++) {
            if (i === lastIndex) {
                node[parts[i]] = value;
            }
            else {
                if (parts[i] in node)
                    node = node[parts[i]];
                else
                    node = node[parts[i]] = {};
            }
        }
        return this;
    }

    /**
     * Resolve a path relative to the app root
     * @param {string} spec The path to resolve relative to the app root
     * @returns 
     */
    resolvePath(spec) {
        //  If the path starts with '@' then it is assumed to be a 
        //  node module and the path should be not be resolved by
        //  the config objects.  NOTE: Node packages starting with
        //  '@' must then have two (e.g. '@@postman')
        if (spec.startsWith('@'))
            return spec.slice(1);
        return path.resolve(this.rootDirectory, spec);
    }
}

module.exports = Configuration;
