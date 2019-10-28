require("dotenv").config();
const Cloud = require('./Cloud');

class AZURECloud extends Cloud {
    constructor(creds, region){
        super(creds, region);
    }
}
module.exports = AZURECloud;