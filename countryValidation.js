"use strict";
require("dotenv").config();

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

const enableCountryWhitelisting = (process.env.ENABLE_COUNTRY_WHITELISTING === 'true');
const whitelistedCountries = process.env.WHITELISTED_COUNTRY_CODES ? process.env.WHITELISTED_COUNTRY_CODES.split(',') : null;

exports.validateCountry = request => {
  let headers = request.headers;
  let isValidCountry = true;
  try {
    if (enableCountryWhitelisting && whitelistedCountries && headers["cloudfront-viewer-country"] && !whitelistedCountries.includes(headers["cloudfront-viewer-country"])) {
       
      if (!/googlebot|chrome-lighthouse|google page speed/i.test(headers["user-agent"])) {
          isValidCountry = false;

        //TODO: Log in queue
        console.log(`[WAF Rejected] : K403 : Country Code : ${headers["cloudfront-viewer-country"]} : ${request.fullUrl} : ${JSON.stringify(request.headers)}`)
      }
      
    }
  } catch (e) {
    console.log(
      "[warn] Couldn't do geo blocking as country-id wasn't present in request."
    );
  } finally{
      return isValidCountry;
  }

};
