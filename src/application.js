/*
 * KLF Application type for NodeJS Express
 * Written by Kristian Oye
 * August 1, 2024
 */
const
    BaseController = require('./baseController'),
    Configuration = require('./configuration'),
    { readFile } = require('node:fs/promises'),
    EventEmitter = require('node:events'),
    express = require('express'),
    path = require('node:path'),
    fs = require('node:fs'),
    { DIContainer } = require('./dicontainer');

/**
 * @typedef {Object} ApplicationSettings
 * @property {string} [configFile] The location of the file containing config data
 * @property {string} rootDirectory The root directory of the application
 */

class Application extends EventEmitter {
    /**
     * 
     * @param {ApplicationSettings} settings 
     */
    constructor(settings = { rootDirectory: '..' }) {
        super();

        /**
         * Path to the main configuration file
         * @type {string}
         */
        this.#configFile = settings.configFile || path.resolve(__dirname, settings.rootDirectory, 'klfserver.json');
        this.#settings = settings;

        fs.watch(this.#configFile, async (changeType, filename) => {
            if (changeType === 'change')
                await this.run(true);
        });
    }

    // #region Private Variables

    /**
     * The underlying Express app 
     * @type {express.Application} 
     */
    #app;

    /**
     * The instance of the application config 
     * @type {Configuration} */
    #config;

    /** 
     * Path to the main configuration file
     * @type {string} 
     */
    #configFile;

    /**
     * @type {DIContainer}
     */
    #di;

    /** 
     * The last time the server was restarted
     * @type {number}
     */
    #lastReload;

    /**
     * The underlying HTTP/HTTPS server
     * @type {import('node:http').Server | import('node:https').Server}
     */
    #server;

    /**
     * Settings used to initialize the app
     * @type {ApplicationSettings} 
     */
    #settings;

    // #endregion

    // #region Public Properties

    get config() {
        return this.#config;
    }

    get container() {
        return this.#di;
    }

    get express() {
        return this.#app;
    }

    get rootDirectory() {
        return this.#config.rootDirectory;
    }

    // #endregion

    //#region Methods

    /**
     * Get the current stack as a queryable structure
     * @returns 
     */
    static getStack() {
        let orig = Error.prepareStackTrace;
        try {
            Error.prepareStackTrace = function (_, stack) {
                return stack;
            };
            let err = new Error;
            Error.captureStackTrace(err);
            const stack = err.stack;
            return stack;
        }
        finally {
            Error.prepareStackTrace = orig;
        }
    }

    /**
     * Render an error page for the user
     * @param {express.Request} request The request that caused the error
     * @param {express.Response} response The response being sent to the client
     * @param {Error} error The actual error 
     */
    handleError(request, response, error) {
        response.render('error', { error });
    }

    /**
     * Set which view engines we are willing to use
     */
    #initViewEngines() {
        let
            /** @type {string[]} */
            viewEngineList = this.config.getValue('server.viewEngines'),
            /** @type {string[]} */
            extensionList = this.config.getValue('server.viewExtensions', []);

        if (Array.isArray(viewEngineList)) {
            viewEngineList.forEach(engine => {
                this.express.set('view engine', engine);
                if (extensionList.indexOf(engine) === -1)
                    extensionList.unshift(engine);

            });
        }
    }

    /**
     * Add static content middleware mappings.  Sorts mappings by descending specificity.
     */
    #mapStaticContent() {
        /** @type {Object.<string,string>} */
        const mappings = this.config.getValue('server.paths.staticContent', {}),
            splitter = /[\/\\]/,
            sortedKeys = Object.keys(mappings)
                .sort((a, b) => {
                    let partA = a.split(splitter),
                        partB = b.split(splitter);

                    return partA.length > partB.length ? -1
                        : partB.length > partA.length ? 1
                            : a.localeCompare(b);
                });

        sortedKeys.forEach(clientDir => {
            const serverDir = path.resolve(this.rootDirectory, mappings[clientDir]);
            this.express.use(clientDir, express.static(serverDir));
        });
    }

    /**
     * Set this application up as a proxy for Express... just for fun
     */
    #proxyExpress() {
        const descriptors = Object.getOwnPropertyDescriptors(this.#app),
            existing = Object.getOwnPropertyDescriptors(this),
            getInstance = () => this.#app;

        for (const [name, desc] of Object.entries(descriptors)) {
            if (false === name in existing) {
                if (typeof desc.value === 'function') {
                    Object.defineProperty(this, name, {
                        value: function (...args) {
                            const instance = getInstance();
                            return instance[name].apply(instance, args);
                        },
                        enumerable: true,
                        configurable: false,
                        writable: false
                    });
                }
                else if (typeof desc.value !== 'undefined') {
                    Object.defineProperty(this, name, {
                        value: function (...args) {
                            const instance = getInstance();
                            return instance[name];
                        },
                        enumerable: true,
                        configurable: false,
                        writable: false
                    });
                }
                else if (desc.get || desc.set) {
                    Object.defineProperty(this, name, {
                        get: function () {
                            const instance = getInstance();
                            return desc?.get?.apply(instance) ?? undefined;
                        },
                        set: function (arg) {
                            const instance = getInstance();
                            if (desc.set)
                                desc.set.apply(instance, arg);
                            else {
                                //  This will throw an error
                                instance[name] = arg;
                            }
                        },
                        enumerable: true,
                        configurable: false
                    });
                }
                else {
                    console.log('woo');
                }
            }
        }
        console.log(descriptors, existing);
    }

    /** 
     * Run the application 
     * ```
     * Step 1: Create the configuration object
     * Step 2: Initialize list of view engines
     * Step 3: Set up content mappings
     * Step 4: Initialize controller definitions
     * Step 5: Start web server
     * ```
     */
    async run(isReload = false) {
        //  Signal listeners the app is re-initializing
        if (isReload === true) {
            //  Do not reload if last change was less than 1s ago
            if (this.#server?.listening && (Date.now() - this.#lastReload) < 1000)
                return;

            this.emit('config.reloading', this);

            if (this.#server?.listening)
                this.#server?.close();
        }
        let configData = await readFile(this.#configFile);
        this.#config = new Configuration({ ...this.#settings, configFile: this.#configFile }, JSON.parse(configData));
        this.#app = express();
        this.#proxyExpress();

        this.#di = new DIContainer(this, this.config.getValue('app.di', {}));
        this.emit('initcontainer', { container: this.container, config: this.config });
        this.#initViewEngines();
        this.#mapStaticContent();

        //  Wire up the controllers
        await BaseController.registerControllersAsync(this);

        // Start the server
        await this.startServer();
    }

    /**
     * Start the underlying HTTP server
     */
    async startServer() {
        if (this.#server?.listening) {
            this.#server.close();
        }
        this.#lastReload = Date.now();
        this.#server = this.#app.listen(this.config.getValue('server.port'));
    }

    //#endregion
}

module.exports = Application;
