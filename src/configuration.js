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
    express = require('express'),
    BaseController = require('./baseController');

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

    get configFile() { return this.#configFile }

    get rootDirectory() { return this.#rootDirectory }

    // #endregion

    /**
     * Fetch a configuration value
     * @param {string} fullKey The value to fetch
     * @param {any} defaultValue A default value... if any
     * @returns 
     */
    getValue(fullKey, defaultValue=undefined) {
        let parts = fullKey.split('.').filter(s => s.length > 0),
            node = this.#configData;

        for(let i=0, max=parts.length, lastIndex=max-1; i<max; i++) {
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

        for(let i=0, max=parts.length, lastIndex=max-1; i<max; i++) {
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
}

module.exports = Configuration;
