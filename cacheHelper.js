"use strict"
require("dotenv").config();


const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");
const cloudFactory = require("./cloudFactory");

const cloudHelper = new cloudFactory(process.env.CLOUD_PROVIDER, {region : process.env.CLOUD_REGION});

exports.invalidateCache = async (requestObject) => {

    if(debugMode) console.log(requestObject);
    try{
        if(requestObject && requestObject.PathsToInvalidate && requestObject.PathsToInvalidate.length > 0){
            if(requestObject.IsRegex){
                let responseStorage = null;
                let responseCDN = null;
                //Storage Delete
                for (const path of requestObject.PathsToInvalidate) {
                    let storageKeysToDelete = await cloudHelper.storageListAllFiles(path);
                    if(debugMode){
                        console.log("storageKeysToDelete: " + JSON.stringify(storageKeysToDelete));
                    }
                    try{
                        await cloudHelper.storageDelete(storageKeysToDelete);
                        if(!responseStorage){
                            responseStorage =  {
                                status : "success"
                            }
                        }
                    }catch(ex){
                        if(traceMode) console.log(ex.stack);
                        if(responseStorage){
                            responseStorage.body += ("\n" + ex.stack);
                        }else{
                            responseStorage =  {
                                status : "error",
                                body : ex.stack
                            }
                        }
                    }
                }

                //CDN Invalidate
                
                try{
                    await cloudHelper.invalidateCDNCache(requestObject.PathsToInvalidate);
                    responseCDN = {
                        status : "success"
                    }
                    if(debugMode) console.log(responseCDN);
                }catch(ex){
                    if(traceMode) console.log(ex.stack);
                    responseCDN = {
                        status : "error",
                        body : ex.stack
                    }
                }

                //4 possible scenarions, 00, 01, 10, 11
                return generateCacheInivalidationResponse(responseStorage, responseCDN);
            }else{
                //Step1 - try-catch - and descriptive error messages (do not just return error)
                let responseStorage = null;
                try{
                    await cloudHelper.storageDelete(requestObject.PathsToInvalidate);
                    responseStorage =  {
                        status : "success"
                    }
                }catch(ex){
                    if(traceMode) console.log(ex.stack);
                    responseStorage =  {
                        status : "error",
                        body : ex.stack
                    }
                }

                //Step2 - try-catch - and descriptive error messages (do not just return error)
                let responseCDN = null;
                try{
                    await cloudHelper.invalidateCDNCache(requestObject.PathsToInvalidate);
                    responseCDN = {
                        status : "success"
                    }
                    if(debugMode) console.log(responseCDN);
                }catch(ex){
                    if(traceMode) console.log(ex.stack);
                    responseCDN = {
                        status : "error",
                        body : ex.stack
                    }
                }
                

                //The response of both the steps needs to be sent back to the developer. 
                //4 possible scenarions, 00, 01, 10, 11
                return generateCacheInivalidationResponse(responseStorage, responseCDN);
                
            }
        }
    }
    catch(ex){
        return {
            status : "error",
            body : "Error : " +  ex.message
        }
    }
    
    return {
        status : "error",
        description : 'Bad Request',
        body : "Invalid request parameters"
    }

}
function generateCacheInivalidationResponse(responseStorage, responseCDN){

    if((responseStorage && responseStorage.status == 'success') && (responseCDN  && responseCDN.status == 'success')){
        return {
            status : "success",
            body : {
                'Modules' : [
                    {
                        'Name' : 'Storage',
                        'Status' : 'success',
                        'ErrorMessage' : null
                    },
                    {
                        'Name' : 'CDN',
                        'Status' : 'success',
                        'ErrorMessage' : null 
                    }
                ]
            }
        }
    }else if((responseStorage && responseStorage.status == 'success') && !(responseCDN  && responseCDN.status == 'success')){
        return {
            status : "partial",
            body : {
                'Modules' : [
                    {
                        'Name' : 'Storage',
                        'Status' : 'success',
                        'ErrorMessage' : null 
                    },
                    {
                        'Name' : 'CDN',
                        'Status' : 'error',
                        'ErrorMessage' : responseCDN.body  
                    }
                ]
            }
        }
    }else if(!(responseStorage && responseStorage.status == 'success') && (responseCDN  && responseCDN.status == 'success')){
        return {
            status : "partial",
            body : {
                'Modules' : [
                    {
                        'Name' : 'Storage',
                        'Status' : 'error',
                        'ErrorMessage' : responseStorage.body  
                    },
                    {
                        'Name' : 'CDN',
                        'Status' : 'success',
                        'ErrorMessage' : null
                    }
                ]
            }
        }
    }else {
        return {
            status : "error",
            body : {
                'Modules' : [
                    {
                        'Name' : 'Storage',
                        'Status' : 'error',
                        'ErrorMessage' : responseStorage.body  
                    },
                    {
                        'Name' : 'CDN',
                        'Status' : 'error',
                        'ErrorMessage' : responseCDN.body  
                    }
                ]
            }
        }
    }
}