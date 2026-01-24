---
name: aws-athena-alb-logs
description: Use when querying ALB/load balancer access logs via Athena. Contains table schema, partition format, and query examples for ScrollFinance production traffic.
---

# ALB Access Logs (Athena)

## AWS Authentication

Before running Athena queries, ensure AWS credentials are valid:

```bash
# Login to AWS SSO (production account)
aws sso login --profile DeveloperAccess-810136717166

# Verify credentials
export AWS_PROFILE=DeveloperAccess-810136717166
aws sts get-caller-identity
```

**Profile**: `DeveloperAccess-810136717166` (production account `810136717166`)

## Table Details

- **Database**: `default`
- **Table**: `alb_k8s_access_logs_prod`
- **Primary Domain**: `https://api.neo.scrollfinance.com`

## Partitioning

⚠️ **CRITICAL**: Always filter by partition to avoid expensive full scans!

- **Column**: `day`
- **Format**: `day = 'YYYY/MM/DD'` (e.g., `day = '2026/01/05'`)

## Schema

| Column                   | Type   | Description                        |
| ------------------------ | ------ | ---------------------------------- |
| `time`                   | string | Request timestamp (ISO format)     |
| `client_ip`              | string | Source IP address                  |
| `request_url`            | string | Full URL including path and query  |
| `request_verb`           | string | HTTP method (GET, POST, etc.)      |
| `elb_status_code`        | int    | HTTP status returned by ALB        |
| `target_status_code`     | string | HTTP status from backend           |
| `target_processing_time` | double | Backend processing time in seconds |
| `received_bytes`         | bigint | Request body size                  |
| `sent_bytes`             | bigint | Response body size                 |
| `user_agent`             | string | Client user agent                  |

## Common Query Patterns

### 5xx Errors

```sql
SELECT time, client_ip, request_url, elb_status_code, target_processing_time
FROM alb_k8s_access_logs_prod
WHERE day = '2026/01/05'
  AND request_url LIKE 'https://api.neo.scrollfinance.com%'
  AND elb_status_code >= 500
ORDER BY time DESC
LIMIT 100;
```

### Slow Requests (>2s)

```sql
SELECT time, request_url, target_processing_time, elb_status_code
FROM alb_k8s_access_logs_prod
WHERE day = '2026/01/05'
  AND request_url LIKE 'https://api.neo.scrollfinance.com%'
  AND target_processing_time > 2.0
ORDER BY target_processing_time DESC
LIMIT 50;
```

### Traffic by Endpoint

```sql
SELECT
  regexp_extract(request_url, 'https://api\.neo\.scrollfinance\.com([^?]*)', 1) as endpoint,
  COUNT(*) as requests,
  AVG(target_processing_time) as avg_latency,
  SUM(CASE WHEN elb_status_code >= 500 THEN 1 ELSE 0 END) as errors
FROM alb_k8s_access_logs_prod
WHERE day = '2026/01/05'
  AND request_url LIKE 'https://api.neo.scrollfinance.com%'
GROUP BY 1
ORDER BY requests DESC
LIMIT 20;
```

### 4xx Client Errors

```sql
SELECT time, client_ip, request_url, elb_status_code
FROM alb_k8s_access_logs_prod
WHERE day = '2026/01/05'
  AND request_url LIKE 'https://api.neo.scrollfinance.com%'
  AND elb_status_code >= 400 AND elb_status_code < 500
ORDER BY time DESC
LIMIT 100;
```

## Tips

- Always start queries with partition filter: `WHERE day = 'YYYY/MM/DD'`
- For date ranges, use: `WHERE day >= '2026/01/01' AND day <= '2026/01/05'`
- Use `LIMIT` to avoid massive result sets
- The `target_processing_time` is in seconds (not milliseconds)
