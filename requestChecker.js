"use strict";
require("dotenv").config();
//--- Start - Regex to to identify request that will be processed by Kitsune
const requestMethodIdentifier = process.env.REQUEST_METHOD_IDENTIFIER.split(',');
const staticAssetIdentifier = new RegExp(process.env.STATIC_ASSET_IDENTIFIER_REGEX, process.env.STATIC_ASSET_IDENTIFIER_REGEX_OPTIONS); 
//Regex ensures html request with query parameters will not be processed by kitsune
const htmlAssetIdentifier = new RegExp(process.env.HTML_ASSET_IDENTIFIER_REGEX, process.env.HTML_ASSET_IDENTIFIER_REGEX_OPTIONS); 
const homePageIdentifier = new RegExp(process.env.HOME_PAGE_IDENTIFIER_REGEX, process.env.HOME_PAGE_IDENTIFIER_REGEX_OPTIONS); 
const excludeStaticUrls = new RegExp(process.env.EXCLUDE_STATIC_URLS_REGEX, process.env.EXCLUDE_STATIC_URLS_REGEX_OPTIONS); 

//--- End - Regex to to identify request that will be processed by Kitsune
const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

//Check static / dynamic request to identify if it should cache at proxy or not
const isOriginRequest = function(request) {
  let isOriginRequest = true;
  try {
    const { path , fullUrl, method, headers } = request;

    //Kitsune rollback - bypass the proxy
    if (process.env.KITSUNE_ROLLBACK === "true"){
      //all request would be origin request
      return true;
    }

    //TODO : update header based customizatio from env
    if (headers && headers['x-requested-with'] && headers['x-requested-with'].toLowerCase().indexOf('com.religare') >= 0){
      return true;
    }

    if (excludeStaticUrls.test(path.toLowerCase())){
      if(debugMode) console.log("excludeStaticUrls.test(path.toLowerCase())");
      isOriginRequest = true;
    }
    else if (requestMethodIdentifier.indexOf(method) < 0) {
      if(debugMode) console.log("requestMethodIdentifier.indexOf(method) < 0");
      isOriginRequest = true;
    } else if (homePageIdentifier.test(path)) {
      if(debugMode) console.log("homePageIdentifier.test(path)");
      isOriginRequest = false;
    } else if (staticAssetIdentifier.test(path)) {
      if(debugMode) console.log(staticAssetIdentifier.test(path));
      isOriginRequest = false;
    } else if (htmlAssetIdentifier.test(fullUrl)) {
      if(debugMode) console.log("htmlAssetIdentifier.test(fullUrl)");
      isOriginRequest = false;
    }

    if(debugMode) console.log("isOriginRequest=" +  isOriginRequest);

  } catch (error) {
    console.log("Error in isOriginRequest : ", JSON.stringify(error));
    //throw error;
  } finally {
    return isOriginRequest;
  }
};

exports.isOriginRequest = isOriginRequest;
