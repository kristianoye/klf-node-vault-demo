/*
 * KLF base controller type for NodeJS Express
 * Written by Kristian Oye
 * August 1, 2024
 */


/**
 * @typedef {Object} ControllerSettings 
 * @property {import('./application')} application
 * @property {Configuration} config
 * @property {string[]} [constructorParameters]
 * @property {string} controllerName 
 * @property {typeof BaseController} controllerType
 * @property {express.Request} request
 * @property {express.Response} response
 * @property {Object.<string,string} viewLookupCache
 * @property {string[]} viewSearchPath
 */

const
    path = require('node:path'),
    express = require('express'),
    { existsSync } = require('node:fs'),
    { readdir } = require('node:fs/promises'),
    ViewNotFoundError = require('./errors/ViewNotFoundError');

var
    /** @type {Object.<string,ControllerSettings>} */
    controllerTypes = {},
    viewCache = {};

/**
 * Contains base controller logic
 */
class BaseController {
    /**
     * Create a controller
     * @param {ControllerSettings} settings
     */
    constructor(settings = {}) {
        this.#settings = settings;
    }

    //#region Private Properties

    /** @type {ControllerSettings} */
    #settings;

    //#endregion

    //#region Public Properties

    get application() {
        return this.#settings.application;
    }

    get config() {
        return this.application.config;
    }

    get express() {
        return this.application.express;
    }

    get request() {
        return this.#settings.request;
    }

    get response() {
        return this.#settings.response;
    }

    get viewLookupCache() {
        return this.#settings.viewLookupCache;
    }

    /**
     * @type {string[]}
     */
    get viewExtensions() {
        return this.config.getValue('server.viewExtensions', ['.html']);
    }

    get viewPath() {
        return this.#settings.viewSearchPath;
    }

    //#endregion

    /**
     * Define a controller type
     * @param {ControllerSettings} settings 
     */
    static addControllerType(settings) {
        //  TODO: Add some validation
        controllerTypes[settings.controllerName] = settings;
    }

    /**
     * 
     * @param {import('./application')} application The calling application
     * @param {string} controllerName The name of the controller to create
     * @param {express.Request} request 
     * @param {express.Response} response 
     */
    static createController(application, controllerName, request, response) {
        if (controllerName in controllerTypes) {
            const settings = controllerTypes[controllerName],
                dependencies = application.container.fill(settings.constructorParameters);

            let { controllerType } = settings,
                instanceSettings = { ...settings, request, response, dependencies }
            return new controllerType(instanceSettings, ...dependencies);
        }
        throw new Error(`Controller type not found: ${controllerName}`);
    }

    /**
     * Get a controller view cache
     * @param {string} controllerName The controller to get a view cache for
     * @returns 
     */
    static getControllerViewCache(controllerName) {
        if (controllerName in viewCache) {
            return viewCache[controllerName];
        }
        return (viewCache[controllerName] = {})
    }

    /**
     * Register all controllers and their routes
     * @param {import('./application')} application
     */
    static async registerControllersAsync(application) {
        const 
            config = application.config, 
            app = application.express;

        let controllerDir = path.resolve(config.rootDirectory, config.getValue('server.controllerDirectory', 'controllers')),
            controllerFiles = (await readdir(controllerDir))
                .filter(f => f.indexOf('Controller') > -1)
                .map(f => path.join(controllerDir, f)),
            parseMethodName = /(?<verb>(get|post|head|delete|put|connect|trace|patch))(?<path>.*)/;

        for(const controllerFile of controllerFiles) {
            const 
                controllerType = require(controllerFile),
                router = express.Router(),
                pathPrefix = controllerType.pathPrefix || false,
                controllerName = controllerType.name.slice(0, controllerType.name.indexOf('Controller')).toLowerCase();
            let
                viewSearchPath = [ path.resolve(`${config.getValue('server.paths.viewPathRoot', 'views')}`, controllerName) ]
                    .concat(config.getValue('server.paths.sharedViews', [])
                        .map(p => path.resolve(config.rootDirectory, p)));
            const
                controllerSettings = {
                    application,
                    config,
                    constructorParameters: [],
                    controllerName,
                    controllerType,
                    viewLookupCache: BaseController.getControllerViewCache(controllerName),
                    viewSearchPath
                };


            if (typeof controllerType.registerRoutes === 'function')
                controllerType.registerRoutes(app, router);
            else {
                /**
                 * Autowire "by convention" steps: 
                 * (1) find methods beginning with valid HTTP verbs (e.g. get, post),
                 * (2) use remainder of method name as path,
                 * (3) extract any parameter names from handler and append to path as placeholders,
                 * (4) create the actual callback handle wrapper for incoming requests in the controller router,
                 */
                let descriptors = Object.getOwnPropertyDescriptors(controllerType.prototype);
                /** @type {{ parameters: string[], verb: string, name: string, urlPath: string, ranking: number, defaultView: string }[]} */
                let sortedRoutes = Object.keys(descriptors).map(name => {
                    /**
                     * Extract parameter names from a function
                     * @param {string} methodDef The raw method text to parse
                     * @returns 
                     */
                    function getParameterNames(methodDef) {
                        const parameterListStart = methodDef.indexOf('(') + 1,
                            parameterListEnd = methodDef.indexOf(')'),
                            parameterList = methodDef.slice(parameterListStart, parameterListEnd),
                            parameters = parameterList.split(',')
                                .filter(p => p.length > 0)
                                .map(p => {
                                    let n = p.indexOf('=');
                                    if (n > -1) {
                                        p = p.slice(0, n);
                                        return p.trim();
                                    }
                                    return p.trim();
                                });
                            return parameters;
                    }
                    let desc = descriptors[name];
                    if (typeof desc.value === 'function') {
                        let m = parseMethodName.exec(name),
                            //  Routes with fewer parameters rank higher than those with more
                            ranking = 0;

                        if (m) {
                            /** @type {[string, string]} */
                            let { verb, path } = m.groups,
                                defaultView = path || 'index',
                                urlPath = controllerType.prototype[name].urlPath,
                                /** @type {string[]} */
                                parameters = getParameterNames(desc.value.toString());

                            if (typeof urlPath !== 'string') {
                                ranking += parameters.length;

                                if (parameters.length > 0) {
                                    const pathSpecifier = parameters
                                        .map(p => `:${p}`)
                                        .join('/');

                                    urlPath = `/${path}/${pathSpecifier}`;
                                }
                                else {
                                    urlPath = '/' + path;
                                }
                            }

                            return { parameters, verb, name, urlPath, ranking, defaultView };
                        }
                        else if (name === 'constructor') {
                            let classText = controllerType.toString(),
                                startConstructor = classText.indexOf('constructor'),
                                endOfParameters = classText.indexOf(')', startConstructor) + 1,
                                constructorParams = classText.slice(startConstructor, endOfParameters);

                            //  Default controller constructor only takes settings;
                            //  Other parameters are assumed to be DI container references
                            const parameters = getParameterNames(constructorParams).slice(1);
                            controllerSettings.constructorParameters.push(...parameters);
                        }
                    }
                    return false;
                })
                .filter(r => r !== false)
                .sort((a, b) => {
                    if (a.ranking < b.ranking)
                        return -1;
                    else if (a.ranking > b.ranking)
                        return 1;
                    else
                        return a.name.localeCompare(b);
                });

                sortedRoutes.forEach(route => {
                    controllerType.prototype[route.name].defaultView = route.defaultView; 
                    router[route.verb].call(router, route.urlPath, 
                        /**
                         * @param {express.Request} request The incomming request message
                         * @param {express.Response} response The response to send back to the client.
                         */
                        async (request, response) => {
                            try {
                                const 
                                    /** Create new controller for request, pass settings, and DI requirements @type {BaseController} */
                                    controller = BaseController.createController(application, controllerName, request, response),
                                    /** Fill the parameters with their respective values @type {string[]} */
                                    parameterList = route.parameters.map(p => {
                                        if (p in request.params)
                                            return request.params[p];
                                        else if (p in request.body)
                                            return request.body[p];
                                    });

                                await controller[route.name].apply(controller, parameterList); 
                            }
                            catch(err) {
                                application.handleError(request, response, err);
                            }
                        });
                });
            }

            BaseController.addControllerType(controllerSettings);

            if (pathPrefix)
                app.use(pathPrefix, router);
            else
                app.use(router);
            }


        app.get('/', (req, res) => {
            res.sendStatus(404);
        });
    }

    /**
     * Locate a view file
     * @param {string} view The view to locate
     * @param {string} extension A specific extension to search for
     * @param {boolean} throwIfNotFound Throw an exception if a view is not found
     * @returns {{ viewFile: string, viewList: string[] }}
     */
    locateViewFile(view = false, extension = false, throwIfNotFound = true) {
        let
            viewExtensions = extension ? [extension] : this.viewExtensions;

        if (!view) {
            //  Expensive, but fun

            let 
                stack = this.application.constructor.getStack(),
                proto = this.constructor.prototype,
                actionIndex = stack.findIndex(f => {
                    let methodRef = proto[f.getMethodName()];
                    return methodRef && methodRef.defaultView;
                }),
                method = actionIndex > -1 && stack[actionIndex].getMethodName();

            if (method)
                view = proto[method].defaultView;
        }

        if (view in this.viewLookupCache) {
            return this.viewLookupCache[view];
        }

        let 
            filePart = view.slice(view.lastIndexOf('/') + 1),
            fileParts = filePart.split('.'),
            existingExtension = fileParts.length > 1 && fileParts.pop(),
            viewList = [];

        if (existingExtension) {
            view = fileParts.join('.');
            viewExtensions = [existingExtension];
        }

        viewList = this.viewPath.flatMap(p => {
            let fn = path.resolve(p, view);
            return viewExtensions.map(e => `${fn}${(e.charAt(0) === '.' ? e : '.' + e)}`);
        });

        for(const viewFile of viewList) {
            if (existsSync(viewFile)) {
                return (this.viewLookupCache[view] = { viewFile, viewList });
            }
        }

        if (throwIfNotFound)
            throw new ViewNotFoundError('No suitable view was found', viewList);

        return (this.viewLookupCache[view] = { viewFile: '', viewList });
    }

    /**
     * Render a view
     * @param {string} view The view to render
     * @param {*} model Optional model to send to the view
     */
    async renderAsync(view = false, model = undefined) {
        if (typeof view === 'object') {
            model = view;
            view = false;
        }
        let { viewFile } = this.locateViewFile(view);
        if (viewFile) {
            if (viewFile.endsWith('.html'))
                return this.response.sendFile(viewFile);
            else
                this.response.render(viewFile, model);
        }
    }

    /**
     * Render a static HTML file
     * @param {string} view The static HTML file to review
     */
    async renderHtml(view = false) {
        let { viewFile } = this.locateViewFile(view, '.html');
        if (viewFile) {
            return this.response.sendFile(viewFile);
        }
    }
}

module.exports = BaseController;