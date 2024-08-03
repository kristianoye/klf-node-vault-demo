class ViewNotFoundError extends Error {
    constructor(message, views) {
        super(message);
        this.attemptedViewList = views;
    }
}

module.exports = ViewNotFoundError;
