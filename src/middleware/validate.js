module.exports = function validate(schemaFn) {
  return (req, res, next) => {
    try {
      const schema = schemaFn();
      const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) {
        return res.status(400).json({ error: 'Validation failed', details: error.details.map(d => d.message) });
      }
      req.body = value;
      return next();
    } catch (err) {
      next(err);
    }
  };
};
