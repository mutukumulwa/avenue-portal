# AiCare Self-Contained Audit Rule

The platform only passes the operational audit when every demonstrated role, permission, linkage, and business record can be created and administered from inside the application.

Seed scripts may create baseline constants and demo conveniences, but they must not be the only way to create operational data.

Allowed baseline seed data:

- Tenant and theme defaults
- Default package templates and benefit categories
- Tax/rate reference types
- Sample provider/service catalog rows

Operational records must have in-app creation or administration paths:

- Users and role assignments
- Broker, HR, member, and fund administrator account links
- Member portal logins and password resets
- Broker profiles and broker portal users
- Self-funded scheme setup, fund administrator assignment, and fund deposits
- Claims, pre-authorizations, complaints, service requests, endorsements, and quotations
- Notification templates and integration configurations

Audit smoke checks should fail any visible menu link that resolves to login, unauthorized, 404, or an application error for the signed-in role.
