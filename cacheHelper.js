"use strict"
require("dotenv").config();
const AWS = require("aws-sdk");
AWS.config.region = "ap-south-1";

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");
const S3BATCHDELETECOUNT = 300;
exports.invalidateCache = async (requestObject) => {

    if(debugMode) console.log(requestObject);
    try{
        if(requestObject && requestObject.PathsToInvalidate && requestObject.PathsToInvalidate.length > 0){
            if(requestObject.IsRegex){
                let responseS3 = null;
                let responseCDN = null;
                //S3 Delete
                for (const path of requestObject.PathsToInvalidate) {
                    let s3KeysToDelete = await getS3KeysFromPath(path);
                    if(debugMode){
                        console.log("s3KeysToDelete: " + JSON.stringify(s3KeysToDelete));
                    }
                    try{
                        await deleteS3Objects(s3KeysToDelete);
                        if(!responseS3){
                            responseS3 =  {
                                status : "success"
                            }
                        }
                    }catch(ex){
                        if(traceMode) console.log(ex.stack);
                        if(responseS3){
                            responseS3.body += ("\n" + ex.stack);
                        }else{
                            responseS3 =  {
                                status : "error",
                                body : ex.stack
                            }
                        }
                    }
                }

                //CDN Invalidate
                let cdnPathsToInvalidate = [];
                requestObject.PathsToInvalidate.forEach(function(path){
                    cdnPathsToInvalidate.push(formatCDNPathRegex(path));
                });
                if(debugMode){
                    console.log("cdnPathsToInvalidate: " + JSON.stringify(cdnPathsToInvalidate));
                }
                try{
                    await invalidateCDNCache(cdnPathsToInvalidate);
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
                return generateCacheInivalidationResponse(responseS3, responseCDN);
            }else{
                //Step1 - try-catch - and descriptive error messages (do not just return error)
                let responseS3 = null;
                try{
                    await deleteS3Objects(requestObject.PathsToInvalidate);
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
        let deletedObjectsLength = 0;
        let s3 = new AWS.S3();

        //Delete in batch of 300
        for(var i = 0; i < Math.ceil(objectsToBeDeleted.length / S3BATCHDELETECOUNT); i++){
            var params = {
                'Bucket': process.env.STORAGE_BUCKET_NAME, 
                'Delete': {
                        'Objects': objectsToBeDeleted.slice(i*S3BATCHDELETECOUNT, i*S3BATCHDELETECOUNT + S3BATCHDELETECOUNT), 
                        'Quiet': true
                    }
            };
               
            if(debugMode){
                console.log("s3.deleteObjects.params");
                console.log(params.Delete);
            }
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
            if(response && response.Deleted && response.Deleted.length > 0){
                deletedObjectsLength += response.Deleted.length;
            }
        }

        if(deletedObjectsLength < objectsToBeDeleted.length){
            if(traceMode){
                console.log("S3 Delete Failed");
                console.log(response);
            }
            return false;
        }
        return true;
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
async function listS3Objects(path, continuationToken){
    let s3 = new AWS.S3();
    var params = {
        Bucket: process.env.STORAGE_BUCKET_NAME, /* required */
        MaxKeys: 1000,
        Prefix: path
    };
    if(continuationToken){
        params["ContinuationToken"] = continuationToken;
    }
    if(debugMode){
        console.log("listS3Objects.params: " + JSON.stringify(params));
    }
    var s3ObjectsResult = new Promise(function(resolve, reject){
        s3.listObjectsV2(params, function(err, data) {
            if (err){
                if(debugMode)
                    console.log(err, err.stack); // an error occurred
                resolve(null);
            } 
            else{
                resolve(data);
            }   
        });
    });
    return s3ObjectsResult;

    //S3 Response format
    /*
    data = {
        Contents: [
            {
                ETag: "\"70ee1738b6b21e2c8a43f3a5ab0eee71\"", 
                Key: "happyface.jpg", 
                LastModified: <Date Representation>, 
                Size: 11, 
                StorageClass: "STANDARD"
            }, 
            {
                ETag: "\"becf17f89c30367a9a44495d62ed521a-1\"", 
                Key: "test.jpg", 
                LastModified: <Date Representation>, 
                Size: 4192256, 
                StorageClass: "STANDARD"
            }
        ], 
        IsTruncated: true, 
        KeyCount: 2, 
        MaxKeys: 2, 
        Name: "examplebucket", 
        NextContinuationToken: "1w41l63U0xa8q7smH50vCxyTQqdxo69O3EmK28Bi5PcROI4wI/EyIJg==", 
        Prefix: ""
    }
   */
}

async function getS3KeysFromPath(path){
    let nextContinuationToken = null;
    let s3ObjectsResult = null;
    let s3Keys = [];
    let formatedPath = formatS3PathRegex(path);
    if(debugMode){
        console.log("formatS3PathRegex: " + formatS3PathRegex(path));
    }
    nextContinuationToken = null;

    do{
        s3ObjectsResult = await listS3Objects(formatedPath, nextContinuationToken);
        
        if(s3ObjectsResult && s3ObjectsResult.KeyCount > 0){
            nextContinuationToken = s3ObjectsResult.NextContinuationToken;
            s3ObjectsResult.Contents.forEach(function(s3obj){
                s3Keys.push(s3obj.Key);
            });
            if(debugMode){
                console.log("s3ObjectsResult.KeyCount: " + s3ObjectsResult.KeyCount);
                console.log("nextContinuationToken: " + nextContinuationToken);
            }
        }
    }while(nextContinuationToken);
    
    return s3Keys;
}

function ltrim(str, chars) {
    chars = chars || "\s";
    return str.replace(new RegExp("^[" + chars + "]+", "g"), "");
}
function rtrim(str, chars) {
    chars = chars || "\s";
    return str.replace(new RegExp("[" + chars + "]$", "g"), "");
}
function formatS3PathRegex(path){
    let formatedPath = null;
    if(path != null){
        formatedPath = ltrim(path.trim(), '/');
        //Remove * from path
        formatedPath = formatedPath.replace(/\*/g, "");
    }
    return formatedPath;
}

function formatCDNPathRegex(path){
    let formatedPath = null;
    if(path != null){
        formatedPath = path.trim();
        if(formatedPath == "*" || formatedPath == ""){
            formatedPath = "/*";
        }else{
            formatedPath = ("/" + ltrim(formatedPath, '/'));
            formatedPath = formatedPath.replace(/\*/g, "") + "*";
        }
    }
    return formatedPath;
}