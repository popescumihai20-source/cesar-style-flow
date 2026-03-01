
-- Tighten audit log INSERT policies - only authenticated users via the SECURITY DEFINER function
DROP POLICY "System pot insera audit log" ON transfer_audit_log;
CREATE POLICY "Authenticated pot insera audit log" ON transfer_audit_log FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'depozit'::app_role));

DROP POLICY "System pot insera sale audit" ON sale_audit_log;
CREATE POLICY "Authenticated pot insera sale audit" ON sale_audit_log FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'casier'::app_role));
