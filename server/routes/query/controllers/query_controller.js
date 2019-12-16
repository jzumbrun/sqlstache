const Ajv = require('ajv')
const intersection = require('lodash/intersection')
const config = require('@app/config')
const QueryModel = require('@app/routes/query/models/query_model')
const server = require('@app/lib/server')


/**
 * Validate Request
 * @param {object} request 
 * @param {Ajv} ajv 
 */
function validateRequest(request = {}, ajv) {

    return ajv.validate({
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "default": "ERROR_MISSING_NAME"
            },
            "properties": {
                "type": "object",
                "default": {}
            }
        },
        "additionalProperties": false,
        "required": ["name"]
    }, request)
    
}


/**
 * Validate Query
 * @param {object} query 
 * @param {Ajv} ajv 
 */
function validateQuery(query = {}, ajv) {

    return ajv.validate({
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "default": "ERROR_MISSING_NAME"
            },
            "expression": {
                "type": "string",
                "default": "ERROR_MISSING_EXPRESSION"
            },
            "properties": {
                "type": "object",
                "default": {}
            },
            "schema": {
                "type": "object",
                "default": {}
            },
            "access": {
                "type": "array",
                "default": []
            }
        },
        "additionalProperties": false,
        "required": ["name", "expression"]
    }, query)
}


/**
 * query
 */
server.post('/query', async (req, res) => {

    var response = {queries: []}
        allowed_queries = require('../allowed_queries'),
        ajv = new Ajv({ useDefaults: true })

    try {

        req.body.queries = req.body.queries || []
        for(const request of req.body.queries) {
            if(!validateRequest(request, ajv)){
                response.queries.push({name: request.name, error: {'errno': 1000, 'code': 'ERROR_REQUEST_VALIDATION', details: ajv.errors}})
                continue
            }

            let query = allowed_queries.find(q => q.name == request.name)
            if(!validateQuery(query, ajv)){
                response.queries.push({name: request.name, error: {'errno': 1001, 'code': 'ERROR_QUERY_DEFINITION_VALIDATION', details: ajv.errors}})
                continue
            }

            // Do we have sql ?
            if(!query){
                response.queries.push({name: request.name, error: {'errno': 1002, 'code': 'ERROR_QUERY_NOT_FOUND'} })
                continue
            }

            // Do we have access rights?
            if(!intersection(query.access, req.user.access).length){
                response.queries.push({name: request.name, error: {'errno': 1003, 'code': 'ERROR_QUERY_NO_ACCESS'} })
                continue
            }
            
            try {
                if(!ajv.validate(query.schema, request.properties))
                    response.queries.push({name: request.name, error: {'errno': 1004, 'code': 'ERROR_QUERY_PROPERTIES_VALIDATION', details: ajv.errors}})
                else {
                    let rows = await QueryModel.query(query.expression, request.properties, req.user)
                    response.queries.push({name: request.name, results: rows })
                }
                
            } catch(error) {
                if(config.env == 'production')
                    response.queries.push({ name: request.name, error: {'errno': 1005, 'code': 'ERROR_BAD_QUERY'}})
                else
                    response.queries.push({ name: request.name, error: {'errno': 1005, 'code': 'ERROR_BAD_QUERY', details: ajv.errors}})
            }
            
        }
        
        res.send(response)
    } catch(error) {
        if(config.env == 'production')
            res.send({error: {'errno': 1006, 'code': 'ERROR_BAD_QUERY'}})
        else
            res.send({error: {'errno': 1006, 'code': 'ERROR_BAD_QUERY', details: error.message}})
    } finally {
        QueryModel.release()
    }
})
