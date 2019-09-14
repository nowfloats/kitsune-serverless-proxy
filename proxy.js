require("dotenv").config();
const axios = require("axios");
let debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

const originRequestTimeout = (process.env.ORIGIN_REQUEST_TIMEOUT_SECONDS && !isNaN(parseInt(process.env.ORIGIN_REQUEST_TIMEOUT_SECONDS)) 
                              ? parseInt(process.env.ORIGIN_REQUEST_TIMEOUT_SECONDS) 
                              :  600) * 1000; //default 600 secs
const staticAssetsExtensions = new RegExp(process.env.STATIC_ASSET_IDENTIFIER_REGEX, process.env.STATIC_ASSET_IDENTIFIER_REGEX_OPTIONS); 

function handleLocalHostRequests(request){
  if (request.headers.host == "localhost") {
    request.headers["host"] = process.env.TARGET_PROXY_DOMAIN;
  }
}

const invokeProxy = async request => {

  //Sanitize the path
  request.path = request.path.replace(/^\/+/, "/");

  if (!request.headers) {
    request.headers = {};
  }

  //to get the raw response without encoding
  //TODO : optimize this
  request.headers["accept-encoding"] = "identity";

  //to debug in local
  handleLocalHostRequests(request);

  var newProxyRequest = {
    url: request.path,
    method: request.method,
    baseURL: `${process.env.ORIGIN_PROTOCOL}://${process.env.TARGET_PROXY_DOMAIN}/`,
    timeout: originRequestTimeout, 
    readTimeout: originRequestTimeout,
    headers: request.headers,
    data: request.body,
    validateStatus: undefined, // resolve  for all response codes
    maxRedirects: 0, // Pass the redirect response to browser, do not handle it in middleware
    responseType: 'arraybuffer'
  };

  if (request.querystring && request.querystring !== "") {
    newProxyRequest.url += `?${request.querystring}`;
  }

  try {
    if (debugMode) {
      console.log("ProxyRequest");
      console.log(JSON.stringify(newProxyRequest));
    }

   

    var proxyResponse = await axios.request(newProxyRequest);
    if(debugMode){
      console.log("Proxy Response Headers");
      console.log(JSON.stringify(proxyResponse.headers));
    }

    let headersFromOrigin = proxyResponse.headers;

    if (staticAssetsExtensions.test(newProxyRequest.url)) {
      if (headersFromOrigin["cache-control"] === null) {
        headersFromOrigin["cache-control"] = "public, max-age=31536000";
      }
    }
    headersFromOrigin["x-powered-by"] = "kitsune serverless runtime 2.0";
    headersFromOrigin["x-kit-source"] = "Kitsune origin porxy"; 

    proxyResponse.body = proxyResponse.data;
    proxyResponse.headers = headersFromOrigin;

    return proxyResponse;
  } catch (e) {
        console.log(`[Error] Failed to proxy ${newProxyRequest.baseURL} ${newProxyRequest.url} due to: ${e.message}`);
      if (e.response) {
          e.response.body = e.response.data;
          e.response.statusDescription = e.statusText;
          return e.response;
      } else {
        return null;
      }
  }
};

exports.invokeProxy = invokeProxy;
