"use strict";
require("dotenv").config();
const requestChecker = require("./requestChecker.js");
const waf = require("./waf.js");
const compressionHelper = require('./compressionHelper.js');
let proxyHelper = require("./proxyHelper.js");
let countryValidation = require("./countryValidation.js");

//TODO : update based on cloud provider
const AWS = require("aws-sdk");
AWS.config.region = "ap-south-1";

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
    //process request from S3
    request.path = request.path.replace(/\/\//g, "\/"); //Replaec // in url to /

    var staticResponse = await staticRequestHandler(request);
    
    //if error from S3, then try it from origin
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
            !(originResponse.headers["cache-control"] && originResponse.headers["cache-control"].toLowerCase() == "no-cache")){
              cacheInStorage = false;
          }
        } 
        if(cacheInStorage){
          await putObjectToS3(
            process.env.STORAGE_BUCKET_NAME,
            generateS3Key(request, includeQueryParams),
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
async function  putObjectToS3(bucket, key, data, contentType, expiryDate) {
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
    var res = await s3Put(params);
    
    let gzData = await compressionHelper.compressGZ(data);
    //if gzip compressed
    if(gzData){
      let gzParams = Object.assign({}, params); 
      gzParams.Body = gzData;
      gzParams.ContentEncoding = 'gzip';
      gzParams.Key = 'gzip/' + params.Key;
      await s3Put(gzParams);
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
      await s3Put(brParams);
    }else{
      console.log(`[ERROR] Unable to compress 'br' : ${params.Key}`);
    }

   
  }catch(e){
    console.log("[Error] : Put Object to S3 : ");
    console.log(e);
    return null;
  }
  
}
const s3Put = async params => {
  var s3 = new AWS.S3();
  return await new Promise(function (resolve, reject) {
    s3.putObject(params, function (err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(false);
      } else {
        if (debugMode) {
          console.log("S3 upload success" + bucket + ":" + key);
          console.log(data); // successful response
        }
        resolve(true);
      }
    });
  });
}
const s3Get = async (params, encoding) => {

  if(encoding){
    params.Key = `${encoding}/${params.Key}`
  }
  var s3 = new AWS.S3();
  return await new Promise(function (resolve, reject) {
    s3.getObject(params, function (err, data) {
      if (err) {
        if (debugMode) {
          console.log("S3 Key not found: " + params.Key);
          console.log(err.message); // an error occurred
        }
        resolve(null);
      } else {
        var cacheControlString = "";
        if (data.ContentType && /html/i.test(data.ContentType)) {
          //set html cache time as 24 hours
          cacheControlString = 'public, max-age=86400';
        } else {
          //set other asset type cache time as 1 year
          cacheControlString = 'public, max-age=31536000';
        }
        
        var response = {
          headers: {
            'content-type': data.ContentType,
            'content-length': data.ContentLength,
            'cache-control': cacheControlString,
            'x-powered-by': "kitsune runtime 0.2",
            'x-kit-source': "Kitsune asset storage"
          },
          body: data.Body,
          status: 200,
          statusDescription: "OK"
        }
        if(data.ContentEncoding){
          response.headers['content-encoding'] = data.ContentEncoding;
        }
        resolve(response);
      }
    });
  });
}
const staticRequestHandler = async request => {
 
    try {
      //using the s3 sdk
      var params = {
        Bucket: process.env.STORAGE_BUCKET_NAME,
        Key: generateS3Key(s3Request, includeQueryParams)
      };
      let compressionHeader = (request.headers['x-compression'] || '').trim().toUpperCase();
      let s3Response = null;
      switch(compressionHeader){
        case 'BR' : 
          s3Response =  await s3Get(params, 'br');
          if(!s3Response){
            s3Response = await s3Get(params, 'gzip');
          }
          if(!s3Response){
            s3Response = await s3Get(params);
          }
          return s3Response;
        break;

        case 'GZIP' : 
          s3Response =  await s3Get(params, 'gzip');
          if(!s3Response){
            s3Response = await s3Get(params);
          }
          return s3Response;
        break;

        default : 
          return await s3Get(params);
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
function generateS3Key(request, includeQueryParams){
  
  let s3Key = request.path;
  if (!ltrim(s3Key, "/")) {
    s3Key = "/index.html";
  }
  s3Key = ltrim(s3Key, "/");

  if(includeQueryParams && request.querystring){
    let encodedQueryString = (new Buffer(request.querystring)).toString('base64');
    s3Key = s3Key + "?" + encodedQueryString;
  }
  return s3Key;
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