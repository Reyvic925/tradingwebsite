-- Wording only: retain the distinction between model profiles and real individuals.
INSERT INTO admin_audit_logs(admin_user_id,action,entity_type,entity_id,details_json)
SELECT a.id,'profile_wording_updated','trader',CAST(t.id AS TEXT),json_object('previous_bio',t.bio)
FROM traders t JOIN auth_users a ON lower(a.email)='admin@theprimemarkets.com'
WHERE t.bio LIKE 'Fictional strategy profile.%' OR t.bio LIKE 'Fictional multi-asset strategy%';

UPDATE traders SET bio=replace(bio,'Fictional strategy profile.','Model strategy profile.'),updated_at=CURRENT_TIMESTAMP
WHERE bio LIKE 'Fictional strategy profile.%';
UPDATE traders SET bio=replace(bio,'Fictional multi-asset strategy','Model multi-asset strategy'),updated_at=CURRENT_TIMESTAMP
WHERE bio LIKE 'Fictional multi-asset strategy%';
