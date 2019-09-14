"use strict"
require("dotenv").config();
const AWS = require("aws-sdk");
AWS.config.region = "ap-south-1";

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

exports.invalidateCache = async (requestObject) => {

    if(debugMode) console.log(requestObject);
    try{
        if(requestObject && requestObject.PathsToInvalidate && requestObject.PathsToInvalidate.length > 0){
            if(requestObject.IsRegex){
                //TODO : Implement regex invalidation
            }else{
                //Step1 - try-catch - and descriptive error messages (do not just return error)
                let responseS3 = null;
                try{
                    await deleteS3Objects(requestObject.PathsToInvalidate);
                    if(debugMode) console.log(responseS3);
                    responseS3 =  {
                        status : "success"
                    }
                }catch(ex){
                    if(traceMode) console.log(ex.stack);
                    responseS3 =  {
                        status : "error",
                        body : ex.stack
                    }
                }

                //Step2 - try-catch - and descriptive error messages (do not just return error)
                let responseCDN = null;
                try{
                    await invalidateCDNCache(requestObject.PathsToInvalidate);
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
                return generateCacheInivalidationResponse(responseS3, responseCDN);
                
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
function generateCacheInivalidationResponse(responseS3, responseCDN){

    if((responseS3 && responseS3.status == 'success') && (responseCDN  && responseCDN.status == 'success')){
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
    }else if((responseS3 && responseS3.status == 'success') && !(responseCDN  && responseCDN.status == 'success')){
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
    }else if(!(responseS3 && responseS3.status == 'success') && (responseCDN  && responseCDN.status == 'success')){
        return {
            status : "partial",
            body : {
                'Modules' : [
                    {
                        'Name' : 'Storage',
                        'Status' : 'error',
                        'ErrorMessage' : responseS3.body  
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
                        'ErrorMessage' : responseS3.body  
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
async function invalidateCDNCache(itemsToBeInvalidated){
    if(itemsToBeInvalidated && Array.isArray(itemsToBeInvalidated) && itemsToBeInvalidated.length > 0){
        let cloudfront = new AWS.CloudFront();
        let items = [];
        itemsToBeInvalidated.forEach(function(item){
            items.push('/' + ltrim(item, "/"));
        })

        var params = {
            DistributionId: process.env.CDN_ID, /* required */
            InvalidationBatch: { /* required */
                CallerReference: new Date().getTime().toString(), /* required */
                Paths: { /* required */
                    Quantity: items.length, /* required */
                    Items: items
                }
            }
        };
        if(debugMode) console.log("CDN Request Parameters :" + JSON.stringify(params));
        return await new Promise(function (resolve, reject){

            cloudfront.createInvalidation(params, function(err, data) {
                if (err){
                    reject(err);
                    if(debugMode) console.log(err, err.stack); // an error occurred
                } 
                else{
                    resolve(data);
                    if(debugMode) console.log(data);           // successful response
                }
            });
        });
            
    }
}
async function deleteS3Objects(keysToDelete){
    var objectsToBeDeleted = [];
    if(keysToDelete && keysToDelete.length > 0){
        keysToDelete.forEach(function(key){
            key = ltrim(key, "/")
            objectsToBeDeleted.push({
                Key: key 
            });
            objectsToBeDeleted.push({
                Key: 'br/' + key 
            });
            objectsToBeDeleted.push({
                Key: 'gzip/' + key 
            });
        })
    }
    if(objectsToBeDeleted.length > 0){
        var params = {
            Bucket: process.env.STORAGE_BUCKET_NAME, 
            Delete: {
                    Objects: objectsToBeDeleted, 
                    Quiet: false
                }
        };
        let s3 = new AWS.S3();
        
        var response = await new Promise(function (resolve, reject){
            s3.deleteObjects(params, function(err, data) {
                if (err){
                    if(debugMode) console.log(err, err.stack); // an error occurred
                    reject(err);
                } 
                else{
                    if(debugMode) console.log(data);           // successful response
                    resolve(data);
                }
            });
        });

        if(debugMode) console.log(JSON.stringify(response));
        if(response && response.Deleted && response.Deleted.length > 0){
            return true;
        }
        if(debugMode){
            console.log("S3 Delete Failed");
            console.log(response);
        }
        return false;
         /*
         data = {
          Deleted: [
             {
            Key: "HappyFace.jpg", 
            VersionId: "yoz3HB.ZhCS_tKVEmIOr7qYyyAaZSKVd"
           }, 
             {
            Key: "HappyFace.jpg", 
            VersionId: "2LWg7lQLnY41.maGB5Z6SWW.dcq0vx7b"
           }
          ]
         }
         */
    }
    return false;
}
function ltrim(str, chars) {
    chars = chars || "\s";
    return str.replace(new RegExp("^[" + chars + "]+", "g"), "");
  }