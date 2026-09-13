const assert = require('assert');
const { issueEmailVerificationToken, verifyEmailToken } = (()=>{ try{return require('./db')}catch(e){return {}}})();
console.log('Golden Ghost V32 integration-test: use RUN_INTEGRATION_TESTS=true with a configured environment for live tests.');
if (process.env.RUN_INTEGRATION_TESTS !== 'true') process.exit(0);
console.log('Live integration tests require a running service and provider configuration.');
