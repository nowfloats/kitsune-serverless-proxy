const AZURECloud = require("./AZURECloud");
const AWSCloud = require("./AWSCloud");
class CloudFactory {
    constructor(type, options) {
        if(type === "AWS")
            return new AWSCloud(options);
        if(type === "AZURE")    
            return new AZURECloud(options);
        
        return null;
    }
};

module.exports = CloudFactory;