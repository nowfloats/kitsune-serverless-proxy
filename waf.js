"use strict";
require("dotenv").config();
//--- Start - Regex to to identify request that will be processed by Kitsune
const wafEnabled = (process.env.WAF_ENABLED === "true")
const illegalFileType = new RegExp(process.env.ILLEGAL_FILE_TYPE_REGEX, process.env.ILLEGAL_FILE_TYPE_REGEX_OPTIONS); 
const illegalPath = new RegExp(process.env.ILLEGAL_FILE_PATH_REGEX, process.env.ILLEGAL_FILE_PATH_REGEX_OPTIONS); //Regex for config and etc directory access
const illegalFileTypeCode = 'K401';
const illegalPathCode = 'K402';
const validRequestCode = 0;
//--- End - Regex to to identify request that will be processed by Kitsune
const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

const validateRequestWAF = function (request) {
    let responseCode = validRequestCode;
    try {

        if(wafEnabled){

            const { path, fullUrl, method } = request;

            if (illegalFileType.test(path)) {
                responseCode = illegalFileTypeCode;
            } else if (illegalPath.test(path)) {
                responseCode = illegalPathCode;
            } 
            if (debugMode)
                console.log("responseCodeWAF=" + responseCode);
                
            //Log WAF Rejection
            if(responseCode != validRequestCode){
                console.log(`[WAF Rejected] : ${responseCode} : ${fullUrl} : ${JSON.stringify(request.headers)}`)
            }
        }
       

    } catch (error) {
        console.log("Error in validateRequestWAF : ", JSON.stringify(error));
        //throw error;
    } finally {
        return responseCode;
    }
};

exports.validateRequestWAF = validateRequestWAF;
