/*
 * KLF dependency injection type for NodeJS Express
 * Written by Kristian Oye
 * August 1, 2024
 */

const
    Lifespan = Object.freeze({
        /**
         * Singleton dependency
         */
        Lifetime: 0,
        /**
         * Component is discarded after use
         */
        SingleUse: 1
    }),
    path = require('node:path');

/**
 * @typedef {Object} DISpec
 * @property {function(any): void} configure Configure a newly created component
 * @property {string} key The name associated with this dependency
 * @property {string} module The module that contains the dependency (if any)
 * @property {'Lifetime' | 'SingleUse'} lifespan How long does the component live after created
 * @property {function(DIBuilderArgs): any} builder Optional function to handle creation of the component
 */

/**
 * @typedef {Object} DIBuilderArgs
 * @property {any[]} args Arguments passed to createInstance
 * @property {*} [module] Information from an imported module (if any)
 * @property {string} [typeName] An optional type name parameter
 */

class DIEntry {
    /**
     * An entry for the DI container
     * @param {import('./application')} app The container owner
     * @param {Partial<DIEntry>} data Initialization data
     */
    constructor(app, data) {
        this.key = typeof data.key === 'string' && data.key || 'unknown';
        /** @type {function(DIBuilderArgs): any} */
        this.builder = typeof data.builder === 'function' && data.builder;
        this.configure = typeof data.configure === 'function' && data.configure;
        this.instance = false;
        this.lifespan = data.lifespan && Lifespan[data.lifespan] || Lifespan.Lifetime;
        this.moduleExports = false;
        this.modulePath = typeof data.module === 'string' && app.config.resolvePath(data.module);
        if (this.modulePath)
            this.moduleExports = require(this.modulePath);
        if (!this.modulePath && !this.builder)
            throw new Error(`Invalid dependency '${this.key}'`)
    }

    /**
     * Create an instance of the configured component
     * @param {{ typeName: string, args: any[] }} spec
     * @returns 
     */
    async createInstance({ typeName, args } = spec) {
        let result = false;

        if (this.instance)
            return this.instance;

        if (typeof this.moduleExports === 'function' && this.moduleExports.toString().startsWith('class ')) {
            result = new this.moduleExports(...args);
        }
        else if (this.builder) {
            result = await this.builder({ module: this.moduleExports, typeName, args });
        }
        else {
            throw new Error(`Failed to create dependency entry '${this.key}'`);
        }
        if (typeof this.configure === 'function')
            result = await this.configure(result, ...args);
        return result;
    }
}

class DIContainer {
    /**
     * 
     * @param {import('./application')} app The application root directory
     * @param {Object.<string,Partial<DIEntry>>} content 
     */
    constructor(app, content = {}) {
        this.#modules = content;
        this.#owner = app;
        for (const [key, value] of Object.entries(content)) {
            this.register(key, value);
        }
    }


    /** @type {Object.<string,DIEntry>} Collection of defined modules */
    #modules;

    /** @type {import('./application')} The object that owns this container */
    #owner;

    /**
     * Fill a DI request
     * @param {string[]} requestList 
     */
    async fill(requestList) {
        let result = Array(requestList.length);
        for (let i = 0, max = requestList.length; i < max; i++) {
            result[i] = await this.get(requestList[i]);
        }
        return result;
    }

    /**
     * Get a single dependency
     * @param {string} key The name of the dependency to fetch
     * @returns 
     */
    async get(key) {
        if (key in this.#modules) {
            let entry = this.#modules[key];

            switch (entry.lifespan) {
                case Lifespan.Lifetime:
                    if (entry.instance)
                        return entry.instance;
                    return (entry.instance = await entry.createInstance({ args: [this.#owner] }));

                case Lifespan.SingleUse:
                    return await entry.createInstance({ args: [this.#owner] });

                default:
                    throw new Error(`Invalid lifespan specified for ${key}`);
            }
        }
        return undefined;
    }

    /**
     * Register a dependency
     * @param {string} name The name to associate with the dependency
     * @param {DISpec} spec Info on how to create the dependency
     * @param {boolean} overwrite Overwrite any existing entry
     */
    register(name, spec, overwrite = false) {
        let entry = new DIEntry(this.#owner, { key: name, lifespan: Lifespan.Lifetime, ...spec });
        if (name in this.#modules && !overwrite) {
            throw new Error(`WARNING: There is already a component named '${name}'`);
        }
        this.#modules[name] = entry;
        return this;
    }
}

module.exports = { DIContainer, Lifespan };