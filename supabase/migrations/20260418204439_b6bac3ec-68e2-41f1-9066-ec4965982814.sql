UPDATE group_members SET status='active', updated_at=now()
WHERE group_id='a0e8946d-524c-4dbf-a1dd-3fb5303bfa63'
  AND user_id IN (
    '89dedfeb-38d1-4357-a124-c9521ecc6668',
    'cd5a8e53-495f-4e98-9ce2-7ecce7caf760',
    'f2b9fa99-7cb1-4364-9bca-e5b113b60029',
    'd12fc6fe-8b1e-424c-8d66-3ebfb23f454e'
  );