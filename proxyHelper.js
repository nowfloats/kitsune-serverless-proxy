"use strict";
require("dotenv").config();
const proxy = require("./proxy");
const preOriginFetch = require('./plugins/preOriginProcessor.js');
const postOriginFetch = require('./plugins/postOriginProcessor.js');
const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

exports.processRequest = async (request, shouldCache) => {

  //invoke pre proxy
  request = preOriginFetch.invoke(request, shouldCache, debugMode);

  let response = await proxy.invokeProxy(request, shouldCache);

  //invoke post proxy
  response = postOriginFetch.invoke(request, response, shouldCache, debugMode);

  return response;
};
