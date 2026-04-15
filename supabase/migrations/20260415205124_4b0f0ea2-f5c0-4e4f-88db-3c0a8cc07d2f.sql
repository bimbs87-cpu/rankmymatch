
-- Delete all related data for the duplicate group
DELETE FROM notifications WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM invite_links WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM group_join_requests WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM group_admin_permissions WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM branding_settings WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM group_subscriptions WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM comments WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM exports WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM audit_logs WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM whatsapp_groups WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';

-- Delete rounds (and related data will cascade or be cleaned)
DELETE FROM rounds WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM seasons WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM group_members WHERE group_id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
DELETE FROM groups WHERE id = '6685b58e-fd74-4099-84a3-16b18a76b60f';
