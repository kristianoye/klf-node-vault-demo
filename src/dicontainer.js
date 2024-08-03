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
        Infinite: 0,
        /**
         * Component is discarded after use
         */
        SingleUse: 1
    }),
    path = require('node:path');

class DIEntry {
    /**
     * An entry for the DI container
     * @param {import('./configuration')} config The application root directory
     * @param {Partial<DIEntry>} data Initialization data
     */
    constructor(config, data) {
        this.instance = false;
        this.lifespan = data.lifespan && Lifespan[data.lifespan] || Lifespan.Infinite;
        this.moduleExports = false;
        this.modulePath = path.resolve(config.rootDirectory, data.module);
    }

    createInstance(typeName) {
        if (this.instance)
            return this.instance;
        if (typeof this.moduleExports === 'function' && this.moduleExports.toString().startsWith('class '))
            return (this.instance = new this.moduleExports);
    }
}

class DIContainer {
    /**
     * 
     * @param {import('./configuration')} config The application root directory
     * @param {Object.<string,Partial<DIEntry>>} content 
     */
    constructor(config, content = {}) {
        this.#modules = content;
        this.#moduleCache = {};
        this.config = config;
        for(const [key, value] of Object.entries(content)) {
            this.register(key, value);
        }
    }

    #moduleCache;

    /** @type {Object.<string,DIEntry>} */
    #modules;

    /**
     * Fill a DI request
     * @param {string[]} requestList 
     */
    fill(requestList) {
        return requestList.map(key => this.get(key));
    }

    get(key) {
        if (key in this.#modules) {
            let entry = this.#modules[key];

            if (entry.moduleExports === false) {
                entry.moduleExports = require(entry.modulePath);
            }
            switch(entry.lifespan) {
                case Lifespan.Infinite:
                    if (entry.instance)
                        return entry.instance;
                    return (entry.instance = entry.createInstance());

                case Lifespan.SingleUse:
                    {
                    }
                    break;
            }
            return entry;
        }
        return undefined;
    }

    /**
     * Register a dependency
     * @param {string} name The name to associate with the dependency
     * @param {*} spec 
     */
    register(name, spec) {
        let entry = new DIEntry(this.config, spec);
        this.#modules[name] = entry;
    }
}

module.exports = { DIContainer, Lifespan };