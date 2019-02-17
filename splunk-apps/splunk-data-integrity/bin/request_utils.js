// private
const extractParamValues = (paramArray, name) =>
    paramArray.filter(([k]) => k === name).map(([_, v]) => v);

/**
 * Retrieve the query string parameter values with the given name.
 * Returns an empty array if not present.
 *
 * @param request the request object passed by splunkd
 * @param name
 */
const getQueryParamValues = (request, name) =>
    (request.query ? extractParamValues(request.query, name) : []);

/**
 * Retrieve the form parameter values with the given name. Returns an empty array if not present.
 *
 * @param request the request object passed by splunkd
 * @param name
 */
const getFormParamValues = (request, name) =>
    (request.form ? extractParamValues(request.form, name) : []);

/**
 * Retrieve the single (first) query string parameter with the given name.
 * Returns `undefined` if not present or
 * if the request did not contain query string information.
 *
 * @param request the request object passed by splunkd
 * @param name
 */
const getQueryParam = (request, name) => getQueryParamValues(request, name)[0];

/**
 * Retrieve the single (first) form parameter value with the given name.
 * Returns `undefined` if no parameter with
 * the given name is present or if the request does not contain form parameter information.
 *
 * @param request the request object passed by splunkd
 * @param name
 */
const getFormParam = (request, name) => getFormParamValues(request, name)[0];

/**
 * Retrieve the single (first) parameter value with the given name from
 * either the query string (default) or the form parameters if it's a POST request.
 * Returns `undefined` if no parameter with the given name
 * is present or if the request does not contain the corresponding parameter information.
 *
 * @param request the request object passed by splunkd
 * @param name
 */
const getParam = (request, name) =>
    (request.method === 'POST' ? getFormParam(request, name) : getQueryParam(request, name));

module.exports = {
    getQueryParamValues,
    getFormParamValues,
    getQueryParam,
    getFormParam,
    getParam
};
