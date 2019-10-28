"use strict";
require("dotenv").config();
const requestChecker = require("./requestChecker.js");
const waf = require("./waf.js");
const compressionHelper = require('./compressionHelper.js');
const cloudFactory = require("./cloudFactory");
let proxyHelper = require("./proxyHelper.js");
let countryValidation = require("./countryValidation.js");

//TODO : update based on cloud provider
const cloudHelper = new cloudFactory(process.env.CLOUD_PROVIDER, {region : process.env.CLOUD_REGION});


const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

const includeQueryParams = (process.env.INCLUDE_QUERYPARAMS_FOR_CACHE_KEY === "true");
const overrideNoCacheHeaders = (process.env.OVERRIDE_NO_CACHE_HEADERS === 'true');

exports.handler = async request => {

  let wafresponseCode = waf.validateRequestWAF(request);
  
  if (wafresponseCode && wafresponseCode != 0){
    return getWAFResponseMessage(wafresponseCode);
  }


  if (!countryValidation.validateCountry(request))
  {
    return getWAFResponseMessage("K403");
  }

  let isOriginRequest = requestChecker.isOriginRequest(request);
  if (isOriginRequest) {
    if (debugMode) console.log("[isOriginRequest] True, RequestObject : " + JSON.stringify(request)); 

    return await proxyHelper.processRequest(request, !isOriginRequest);
  }
  else {
    //process request from Storage
    request.path = request.path.replace(/\/\//g, "\/"); //Replaec // in url to /

    var staticResponse = await staticRequestHandler(request);
    
    //if error from storage, then try it from origin
    //   if the request fails at origin then return error
    if (!staticResponse || staticResponse.status > 299) {
      if(debugMode) console.log("[Warning] Static response not found : " + request.path);

      let shouldCache = !isOriginRequest;
      var originResponse = await proxyHelper.processRequest(request, shouldCache);
      originResponse.headers["x-kit-source"] = "Kitsune asset storage";

      if (originResponse.status < 300) {
        let cacheInStorage = true;
        //Don't cache in asset storage if the overrideNoCacheHeaders is set and cache-control is no-cache from origin
        if (overrideNoCacheHeaders){
          if(!originResponse.headers || 
            (originResponse.headers["cache-control"] && originResponse.headers["cache-control"].toLowerCase() == "no-cache")){
              cacheInStorage = false;
          }
        } 
        if(cacheInStorage){
          await putObjectToStorage(
            process.env.STORAGE_BUCKET_NAME,
            generateStorageKey(request, includeQueryParams),
            originResponse.body,
            originResponse.headers["content-type"]
          );
        }
      }

      return originResponse;

    } else {
      return staticResponse;
    }
  }
};
async function  putObjectToStorage(bucket, key, data, contentType, expiryDate) {
  try{
   
    if(!expiryDate){
      expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }
    
    
    var params = {
      Bucket: bucket,
      Key: key,
      Body: data,
      ACL: "public-read",
      ContentType: contentType,
      Expires: expiryDate
    };
    var res = await cloudHelper.storagePut(params);
    
    let gzData = await compressionHelper.compressGZ(data);
    //if gzip compressed
    if(gzData){
      let gzParams = Object.assign({}, params); 
      gzParams.Body = gzData;
      gzParams.ContentEncoding = 'gzip';
      gzParams.Key = 'gzip/' + params.Key;
      await cloudHelper.storagePut(gzParams);
    }
    else{
      console.log(`[ERROR] Unable to compress 'gzip' : ${params.Key}`);
    }

    let brData = await compressionHelper.compressBR(data);
    //if br compressed
    if(brData){
      let brParams = Object.assign({}, params); 
      brParams.Body = brData;
      brParams.ContentEncoding = 'br';
      brParams.Key = 'br/' + params.Key;
      await cloudHelper.storagePut(brParams);
    }else{
      console.log(`[ERROR] Unable to compress 'br' : ${params.Key}`);
    }

   
  }catch(e){
    console.log("[Error] : Put Object to Storage : ");
    console.log(e);
    return null;
  }
  
}

const staticRequestHandler = async request => {
 
    try {
      //using the storage
      var params = {
        Bucket: process.env.STORAGE_BUCKET_NAME,
        Key: generateStorageKey(request, includeQueryParams)
      };
      let compressionHeader = (request.headers['x-compression'] || '').trim().toUpperCase();
      let storageResponse = null;
      switch(compressionHeader){
        case 'BR' : 
          storageResponse =  await cloudHelper.storageGet(params, 'br');
          if(!storageResponse){
            storageResponse = await cloudHelper.storageGet(params, 'gzip');
          }
          if(!storageResponse){
            storageResponse = await cloudHelper.storageGet(params);
          }
          return storageResponse;
        break;

        case 'GZIP' : 
          storageResponse =  await cloudHelper.storageGet(params, 'gzip');
          if(!storageResponse){
            storageResponse = await cloudHelper.storageGet(params);
          }
          return storageResponse;
        break;

        default : 
          return await cloudHelper.storageGet(params);
      }
    } catch (error) {
      console.log("Static Response Error: ");
      console.log(error.Error);
      if(error.response)
        return error.response;
      else
        return null;
    }
};
function generateStorageKey(request, includeQueryParams){
  
  let storageKey = request.path;
  if (!ltrim(storageKey, "/")) {
    storageKey = "/index.html";
  }
  storageKey = ltrim(storageKey, "/");

  if(includeQueryParams && request.querystring){
    let encodedQueryString = (new Buffer(request.querystring)).toString('base64');
    storageKey = storageKey + "?" + encodedQueryString;
  }
  return storageKey;
}
function ltrim(str, chars) {
  chars = chars || "\s";
  return str.replace(new RegExp("^[" + chars + "]+", "g"), "");
}
function getWAFResponseMessage(wafresponseCode){
  return {
    status: 200,
    statusDescription: "WAF Blocked",
    body: `<html><body><p>The requested URL was rejected. Please consult with your administrator.</p><p>Rejection CODE :<strong>[${wafresponseCode}]</strong></p><p><a title="Home page" href="${process.env.ROOT_URL}">[Go to home page]</a></p>  </body></html>`,
    headers: {
      'content-type': 'text/html',
      'cache-control': 'no-cache',
      'x-powered-by': "kitsune runtime 0.2",
      'x-kit-source': "Kitsune WAF"
    }
  };
}