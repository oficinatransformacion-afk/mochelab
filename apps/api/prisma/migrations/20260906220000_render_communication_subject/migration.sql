CREATE OR REPLACE FUNCTION render_communication_subject()
RETURNS trigger AS $$
DECLARE
  rendered TEXT;
  variable RECORD;
BEGIN
  SELECT subject_template INTO rendered
  FROM communication_template
  WHERE code = NEW.template_code AND active = true;
  IF rendered IS NULL THEN
    RETURN NEW;
  END IF;
  FOR variable IN SELECT key, value FROM jsonb_each_text(NEW.variables)
  LOOP
    rendered := replace(rendered, '{{' || variable.key || '}}', COALESCE(variable.value, ''));
  END LOOP;
  NEW.subject := rendered;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER communication_subject_from_template
BEFORE INSERT ON communication
FOR EACH ROW EXECUTE FUNCTION render_communication_subject();
