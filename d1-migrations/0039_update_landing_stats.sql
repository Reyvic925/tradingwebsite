UPDATE platform_stats
SET label = 'Active clients', value = 12000, prefix = '', suffix = '+'
WHERE id = 1;

UPDATE platform_stats
SET label = 'Client deposits', value = 36000000, prefix = '$', suffix = '+'
WHERE id = 2;

UPDATE platform_stats
SET label = 'Daily trades', value = 18000, prefix = '', suffix = '+'
WHERE id = 3;
