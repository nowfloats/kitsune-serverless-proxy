"use strict";

const invoke = function(request,  debugMode) {
    //default return original request
    request.headers = updateClientIPHeader(request.headers);

    return request;
};

function updateClientIPHeader(headers){
    //Sample modification for request headers to forward client IP in custom header  
    if (headers && headers['x-forwarded-for']) {
        headers['x-kit-client-ip'] = headers['x-forwarded-for'].split(',')[0];
    }
    return headers;
}

exports.invoke = invoke;
