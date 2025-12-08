// middleware/validateParams.js

module.exports = function validateParams(schemaFn) {
    return (req, res, next) => {
        try {
            const schema = schemaFn();
            const { error, value } = schema.validate(req.params, {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details.map(d => d.message)
                });
            }

            req.params = value; // sanitized params
            return next();
        } catch (err) {
            next(err);
        }
    };
};
