var express = require("express");
const index = require("./index.js");
const url = require("url");
const contentType = require("content-type");
const getRawBody = require("raw-body");
const cacheHelper = require("./cacheHelper.js");
require("dotenv").config();
const debugMode = (process.env.DEBUG_MODE == "true");
const traceMode = (process.env.TRACE_MODE === "true");


// Constants
var PORT = 80;
// App
var app = express();

app.get("/ping", function(req, res) {
  if(debugMode)
    console.log("ping");
  res.status(200).send("Ok");
});
app.get("/echo.php", function(req, res) {
  if (debugMode)
    console.log("echo.php");
  res.status(200).send("Echo");
});
app.post("/clear-proxy-cache", async function(req, res) {
  const charSet = "utf-8";
  var rawbody = await getRawBody(req, {
    length: req.headers["content-length"],
    limit: "100mb",
    encoding: charSet
  });
  //The API should take input data in JSON format - no transformation should be done
  //Chirag: Either we use new body-parser plugin or we can convert from raw body string 
  let jsonBody = null;
  try{
    jsonBody =  JSON.parse(Buffer.from(rawbody).toString("utf-8"));
  }catch(ex){

      res.status(400).send("Invalid request parameter");
      return;
  }

  if(jsonBody){
    let result = await cacheHelper.invalidateCache(jsonBody);
    if(result && result.status == "success"){
      res.status(200).send(result.body);
    }else{
      res.status(400).send(result.body);
    }
    return;
  }else{
    res.status(500).send("Request body require");
  }

});
app.use(async (req, res) => {
  let start = new Date();
  let parsedUrl = url.parse(process.env.ROOT_URL + req.url);
  let charSet = "utf-8";
  //502 issue, some times content-type header is not present in to request
  if (req.headers && req.headers["content-type"]){
    try {
      charSet = contentType.parse(req).parameters.charset;
    } catch (e) {
      console.log("Error content-type :");
      console.log(e);
    }
  }
  const methodsCanHaveBody = ["POST", "PUT", "DELETE", "PATCH"]

  var body = methodsCanHaveBody.indexOf(req.method) >=0  ? await getRawBody(req, {
                                        length: req.headers["content-length"],
                                        limit: "100mb",
                                        encoding: charSet
                                      })
                                    : null;
  if (debugMode) {
    console.log('creating express JS request object');
    console.log(req);
  }

  var request = {
    path: parsedUrl.pathname,
    fullUrl: req.url,
    method: req.method,
    querystring: parsedUrl.query,
    headers: req.headers,
    body: body
  };
  if(debugMode){
    console.log('creating new request object for processing');
    console.log(request);
  }
  var response = await index.handler(request);
  let executionTime = Math.abs(new Date().getTime() - start.getTime());
  
  if(debugMode)
    console.log(`${req.url} : Request completed with status : ${response.status} : ${executionTime} ms`);

  if(response.status>299){
    response.headers["Cache-Control"] = "no-cache";
  }
  //Don't send 500 in response send 204 instead
  //Need to verify with tech team if they are checking the response code
  // if(response.status == 500){
  //   response.status = 204;
  // }
  res.set(response.headers);
  res.status(response.status).send(response.body);
});

app.listen(PORT);
console.log("Kitsune Origin Proxy Started");
