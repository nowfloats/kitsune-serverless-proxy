"use strict";

const invoke = function(request, response, shouldCache, debugMode) {
    
        if(response){
            if(shouldCache && response.headers['content-type'] && response.headers['content-type'].toUpperCase().indexOf('HTML') > -1){
                response.body = modifyHTML(response.body);
            }
            if(request.path.toUpperCase().indexOf("/SCRIPT.JS") > -1){
                response.body = updateIPStackUrlInJS(response.body);
            }
        }
    return response;

};
function modifyHTML(body){

    let textBody = Buffer.from(body).toString('utf8');
    if(textBody){
        //Modify response body if required
        return Buffer.from(textBody, 'utf8');
    }
}
function updateIPStackUrlInJS(body){
    let textBody = Buffer.from(body).toString('utf8');
    if(textBody){
        //Modify response body if required
        return Buffer.from(textBody, 'utf8');
    }
}
exports.invoke = invoke;
