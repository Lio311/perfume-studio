const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile({ type: 'string', format: 'date' });
console.log(validate('2026-02-30'));
