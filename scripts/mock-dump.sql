SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.7 (Ubuntu 15.7-1.pgdg20.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', '258939b1-4cef-4ffb-a34c-382edd81e170', '{"action":"user_signedup","actor_id":"850fd0fc-7dd1-4b15-89d1-3ab59d09f306","actor_name":"❤️‍🔥 xiq in NYC🔜 Aug 22","actor_username":"theexgenesis@gmail.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"twitter"}}', '2024-08-16 19:08:43.281399+00', ''),
	('00000000-0000-0000-0000-000000000000', '734f7d08-350f-4737-9eda-f075a5f6a7ef', '{"action":"login","actor_id":"850fd0fc-7dd1-4b15-89d1-3ab59d09f306","actor_name":"❤️‍🔥 xiq in NYC🔜 Aug 22","actor_username":"theexgenesis@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"twitter"}}', '2024-08-17 10:25:39.713467+00', ''),
	('00000000-0000-0000-0000-000000000000', '17353475-03c0-40ea-a4ba-b7c12478edca', '{"action":"login","actor_id":"850fd0fc-7dd1-4b15-89d1-3ab59d09f306","actor_name":"❤️‍🔥 xiq in NYC🔜 Aug 22","actor_username":"theexgenesis@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"twitter"}}', '2024-08-17 10:27:38.289828+00', ''),
	('00000000-0000-0000-0000-000000000000', '7cbfa2ad-15e5-4f4c-bd0b-fe274cef3506', '{"action":"login","actor_id":"850fd0fc-7dd1-4b15-89d1-3ab59d09f306","actor_name":"❤️‍🔥 xiq in NYC🔜 Aug 22","actor_username":"theexgenesis@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"twitter"}}', '2024-08-17 10:28:18.677778+00', ''),
	('00000000-0000-0000-0000-000000000000', '3018064f-15c2-4878-8f8f-5f4df7008883', '{"action":"login","actor_id":"850fd0fc-7dd1-4b15-89d1-3ab59d09f306","actor_name":"❤️‍🔥 xiq in NYC🔜 Aug 22","actor_username":"theexgenesis@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"twitter"}}', '2024-08-17 10:28:59.803289+00', '');


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at") VALUES
	('1bee962a-1abd-408d-a700-a32e0411beee', NULL, '4e3b7b1f-2948-4d24-bb34-d22413e2a509', 's256', 'katzrIq0-NI03-g9VzMWBmdKxTs6oWw3OgjfcJRAsgI', 'twitter', '', '', '2024-08-16 16:55:52.230981+00', '2024-08-16 16:55:52.230981+00', 'oauth', NULL),
	('2021ca69-f854-4f1e-917c-4296c52da195', NULL, 'b92848db-4904-4cc2-bb13-d6f73c920e36', 's256', 'csVXESPhDm2at6nU7H6dc5y_teD5nRlj-vS3NViJm3M', 'twitter', '', '', '2024-08-16 16:56:43.999689+00', '2024-08-16 16:56:43.999689+00', 'oauth', NULL),
	('bdb3c5c5-f351-47f1-828f-11bdd5e6d73c', NULL, 'ccedf38c-1bc9-41f3-8153-c7394a6e9b8b', 's256', 'VFLxX7atMcmEbjVpjJCX837Aw8NL0GazG2_7Q_KPwMI', 'twitter', '', '', '2024-08-16 16:57:54.81412+00', '2024-08-16 16:57:54.81412+00', 'oauth', NULL),
	('c6bb7c93-0944-4af6-b334-309ee7dd1328', NULL, '5b0b572f-341d-4d06-a59f-7212a2601507', 's256', 'UKalCs-mL20i09c_gCSSgHUd4xluaetMu3t5uNDk41U', 'twitter', '', '', '2024-08-16 16:57:59.387297+00', '2024-08-16 16:57:59.387297+00', 'oauth', NULL);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', '527711f2-a302-4d17-ad38-b7854f7d04fc', 'authenticated', 'authenticated', 'yiannis.ravanis@gmail.com', NULL, '2024-08-30 23:39:32.867975+00', NULL, '', NULL, '', NULL, '', '', NULL, '2024-08-30 23:56:47.35281+00', '{"provider": "twitter", "providers": ["twitter"], "provider_id": "1796120648281923584"}', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "1796120648281923584", "name": "Emergent", "email": "yiannis.ravanis@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1823129449581162496/uh51rUBL_normal.jpg", "full_name": "Emergent", "user_name": "emergentvibe", "avatar_url": "https://pbs.twimg.com/profile_images/1823129449581162496/uh51rUBL_normal.jpg", "provider_id": "1796120648281923584", "email_verified": true, "phone_verified": false, "preferred_username": "emergentvibe"}', NULL, '2024-08-30 23:39:32.793018+00', '2024-09-05 14:42:35.704635+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'fc459796-b480-48f3-88aa-c8d672c6af66', 'authenticated', 'authenticated', 'brent@brentbaum.com', NULL, '2024-08-21 17:26:46.812725+00', NULL, '', NULL, '', NULL, '', '', NULL, '2024-08-21 17:26:47.89263+00', '{"provider": "twitter", "providers": ["twitter"], "provider_id": "752422021"}', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "752422021", "name": "brent", "email": "brent@brentbaum.com", "picture": "https://pbs.twimg.com/profile_images/1762853337496440832/atyjNDTU_normal.jpg", "full_name": "brent", "user_name": "_brentbaum", "avatar_url": "https://pbs.twimg.com/profile_images/1762853337496440832/atyjNDTU_normal.jpg", "provider_id": "752422021", "email_verified": true, "phone_verified": false, "preferred_username": "_brentbaum"}', NULL, '2024-08-21 17:26:46.769858+00', '2024-08-23 13:26:42.531139+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'fdaa05ff-b28b-4116-9b7c-3b3e545d0774', 'authenticated', 'authenticated', 'zenceph@gmail.com', NULL, '2024-08-26 17:29:48.118408+00', NULL, '', NULL, '', NULL, '', '', NULL, '2024-08-27 22:55:40.027312+00', '{"provider": "twitter", "providers": ["twitter"], "provider_id": "595692178"}', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "595692178", "name": "zen eth/acc", "email": "zenceph@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1603043706172542982/OVE2nDEB_normal.jpg", "full_name": "zen eth/acc", "user_name": "zencephalon", "avatar_url": "https://pbs.twimg.com/profile_images/1603043706172542982/OVE2nDEB_normal.jpg", "provider_id": "595692178", "email_verified": true, "phone_verified": false, "preferred_username": "zencephalon"}', NULL, '2024-08-26 17:29:48.085963+00', '2024-08-28 01:56:30.146117+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'b7b0fb72-91d2-4665-a39b-337070f64045', 'authenticated', 'authenticated', 'omar.sameh.shehata+defendertwitter@gmail.com', NULL, '2024-08-21 17:23:18.980172+00', NULL, '', NULL, '', NULL, '', '', NULL, '2024-08-21 17:23:20.010963+00', '{"provider": "twitter", "providers": ["twitter"], "provider_id": "1680757426889342977"}', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "1680757426889342977", "name": "Defender", "email": "omar.sameh.shehata+defendertwitter@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_normal.jpg", "full_name": "Defender", "user_name": "DefenderOfBasic", "avatar_url": "https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_normal.jpg", "provider_id": "1680757426889342977", "email_verified": true, "phone_verified": false, "preferred_username": "DefenderOfBasic"}', NULL, '2024-08-21 17:23:18.936014+00', '2024-08-28 17:13:40.34631+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('595692178', 'fdaa05ff-b28b-4116-9b7c-3b3e545d0774', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "595692178", "name": "zen eth/acc", "email": "zenceph@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1603043706172542982/OVE2nDEB_normal.jpg", "full_name": "zen eth/acc", "user_name": "zencephalon", "avatar_url": "https://pbs.twimg.com/profile_images/1603043706172542982/OVE2nDEB_normal.jpg", "provider_id": "595692178", "email_verified": true, "phone_verified": false, "preferred_username": "zencephalon"}', 'twitter', '2024-08-26 17:29:48.106783+00', '2024-08-26 17:29:48.10684+00', '2024-08-27 22:55:38.744594+00', '0b732816-0f9f-4103-8846-b680ce12c6d9'),
	('3434231452', '73bf70cd-806d-4056-bedc-b0c31d9217cb', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "3434231452", "name": "Moritz Bierling", "email": "moritzbierling@hey.com", "picture": "https://pbs.twimg.com/profile_images/1695013242911784960/__5W-sDs_normal.jpg", "full_name": "Moritz Bierling", "user_name": "bierlingm", "avatar_url": "https://pbs.twimg.com/profile_images/1695013242911784960/__5W-sDs_normal.jpg", "provider_id": "3434231452", "email_verified": true, "phone_verified": false, "preferred_username": "bierlingm"}', 'twitter', '2024-09-03 08:34:49.384324+00', '2024-09-03 08:34:49.384384+00', '2024-09-03 08:34:49.384384+00', '7c5fb257-9878-4527-a7ef-cc82f3f5fd54'),
	('2063951', '625bb12a-b5aa-4593-a23f-f05a27a51d66', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "2063951", "name": "Love Pilgrim", "email": "tasshinfogleman@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1743798797262852096/z7ihMbpI_normal.jpg", "full_name": "Love Pilgrim", "user_name": "tasshinfogleman", "avatar_url": "https://pbs.twimg.com/profile_images/1743798797262852096/z7ihMbpI_normal.jpg", "provider_id": "2063951", "email_verified": true, "phone_verified": false, "preferred_username": "tasshinfogleman"}', 'twitter', '2024-09-04 23:53:12.918356+00', '2024-09-04 23:53:12.918413+00', '2024-09-04 23:53:12.918413+00', '718c99f2-c198-46d3-a1d6-bde18b1d3aaa'),
	('1335851599483133953', 'd0ee9743-2093-45e1-ab23-812ade1c25ae', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "1335851599483133953", "name": "boy", "email": "nobuga.hibiki+1@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1806231198630604800/887dBQqp_normal.jpg", "full_name": "boy", "user_name": "nobu_hibiki", "avatar_url": "https://pbs.twimg.com/profile_images/1806231198630604800/887dBQqp_normal.jpg", "provider_id": "1335851599483133953", "email_verified": true, "phone_verified": false, "preferred_username": "nobu_hibiki"}', 'twitter', '2024-09-05 03:54:25.744251+00', '2024-09-05 03:54:25.744311+00', '2024-09-05 03:54:25.744311+00', 'bc7cc469-037c-4531-a2e9-64d29142012b'),
	('1680757426889342977', 'b7b0fb72-91d2-4665-a39b-337070f64045', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "1680757426889342977", "name": "Defender", "email": "omar.sameh.shehata+defendertwitter@gmail.com", "picture": "https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_normal.jpg", "full_name": "Defender", "user_name": "DefenderOfBasic", "avatar_url": "https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_normal.jpg", "provider_id": "1680757426889342977", "email_verified": true, "phone_verified": false, "preferred_username": "DefenderOfBasic"}', 'twitter', '2024-08-21 17:23:18.959461+00', '2024-08-21 17:23:18.959521+00', '2024-08-21 17:23:18.959521+00', 'c05af93e-576a-4f7e-8d99-c57f1152cc6a'),
	('1223231444429856769', '40cd7041-b44b-4449-93c4-49959cb1a36f', '{"iss": "https://api.twitter.com/1.1/account/verify_credentials.json", "sub": "1223231444429856769", "name": "River Kenna", "email": "river@riverkenna.com", "picture": "https://pbs.twimg.com/profile_images/1683472737262551040/jSjeHVjq_normal.jpg", "full_name": "River Kenna", "user_name": "the_wilderless", "avatar_url": "https://pbs.twimg.com/profile_images/1683472737262551040/jSjeHVjq_normal.jpg", "provider_id": "1223231444429856769", "email_verified": true, "phone_verified": false, "preferred_username": "the_wilderless"}', 'twitter', '2024-09-05 16:32:27.561848+00', '2024-09-05 16:32:27.561909+00', '2024-09-05 16:32:27.561909+00', 'c22bca2d-0451-4f50-8c25-98ae61e87308');



--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag") VALUES
	('1a918210-b2f8-4a5f-9908-0a107dd7e255', '527711f2-a302-4d17-ad38-b7854f7d04fc', '2024-08-30 23:56:47.352885+00', '2024-08-30 23:56:47.352885+00', NULL, 'aal1', NULL, NULL, 'node', '3.239.97.67', NULL),
	('19538545-eaa5-4832-a6c2-61fba04f5d67', '7c5a3372-5983-4225-b64d-31593214c995', '2024-09-06 03:20:35.909926+00', '2024-09-07 17:40:38.084823+00', NULL, 'aal1', NULL, '2024-09-07 17:40:38.084705', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', '98.115.6.34', NULL),
	('85f390c0-2500-45e4-9272-97004044205c', 'd0ee9743-2093-45e1-ab23-812ade1c25ae', '2024-09-05 03:54:27.764761+00', '2024-09-05 17:59:09.201569+00', NULL, 'aal1', NULL, '2024-09-05 17:59:09.200499', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', '103.78.115.102', NULL),
	('001df0bf-db71-4340-9113-ef4abcc738e4', 'b7b0fb72-91d2-4665-a39b-337070f64045', '2024-08-21 17:23:20.011076+00', '2024-08-28 17:13:41.839619+00', NULL, 'aal1', NULL, '2024-08-28 17:13:41.839545', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', '67.249.80.106', NULL),
	('7e06bd81-a478-4468-8135-994e8fda6a4c', '1474a65b-68f5-40df-91d2-6de09e5f50a9', '2024-09-03 01:16:01.334801+00', '2024-09-04 15:24:17.663646+00', NULL, 'aal1', NULL, '2024-09-04 15:24:17.663562', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0', '173.56.53.254', NULL);



--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('001df0bf-db71-4340-9113-ef4abcc738e4', '2024-08-21 17:23:20.029732+00', '2024-08-21 17:23:20.029732+00', 'oauth', 'e742fe4f-4c29-491f-9963-2379dd3dbdf1'),
	('5694d526-624d-4111-ac2e-7812fe964d93', '2024-08-21 17:26:47.906591+00', '2024-08-21 17:26:47.906591+00', 'oauth', '00093e17-f90a-4fff-af29-5fb87314ae9b'),
	('0a7409a7-5ffc-4ac2-b777-a7e8ecf0405a', '2024-08-26 17:29:49.905383+00', '2024-08-26 17:29:49.905383+00', 'oauth', 'b22c7f37-27dc-4c5c-9d11-21d3d627c838'),
	('893417cc-54e1-408a-a4d1-be2d4e07b364', '2024-08-27 22:55:40.039692+00', '2024-08-27 22:55:40.039692+00', 'oauth', '3482dc0a-4c02-40b8-b3a0-15aaa66976bb'),
	('e9b2c6b0-459d-4411-befe-684ba0a127a3', '2024-08-30 23:39:34.285936+00', '2024-08-30 23:39:34.285936+00', 'oauth', 'f2fd5317-c6f5-4f4b-80b9-960acc97c019'),
	('1a918210-b2f8-4a5f-9908-0a107dd7e255', '2024-08-30 23:56:47.363951+00', '2024-08-30 23:56:47.363951+00', 'oauth', '628a1e94-e3ef-4831-af22-d87975545119');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 136, 'Hnp6TsTtR71jMSX47Nw_vw', '527711f2-a302-4d17-ad38-b7854f7d04fc', true, '2024-09-05 06:51:29.976459+00', '2024-09-05 14:42:35.623948+00', 'M5RmGQ_3TryRkUVLN7CrOg', 'e9b2c6b0-459d-4411-befe-684ba0a127a3'),
	('00000000-0000-0000-0000-000000000000', 138, 'oyCuiBLhGj60R93_6Bsv3Q', '527711f2-a302-4d17-ad38-b7854f7d04fc', false, '2024-09-05 14:42:35.672931+00', '2024-09-05 14:42:35.672931+00', 'Hnp6TsTtR71jMSX47Nw_vw', 'e9b2c6b0-459d-4411-befe-684ba0a127a3'),
	('00000000-0000-0000-0000-000000000000', 142, '-HCgpxQ-CfTivmy_ITFz_Q', 'd0ee9743-2093-45e1-ab23-812ade1c25ae', false, '2024-09-05 17:59:05.728226+00', '2024-09-05 17:59:05.728226+00', 'Sf-R2VOfmKwFWolbeNZ52A', '85f390c0-2500-45e4-9272-97004044205c'),
	('00000000-0000-0000-0000-000000000000', 141, 'AM3UNEbaDslrR00A7qRM8w', '40cd7041-b44b-4449-93c4-49959cb1a36f', true, '2024-09-05 17:39:08.655803+00', '2024-09-06 05:36:06.472207+00', 'VI9z2P2dEBu6rBqaa8lNqg', '78701e23-3337-4a60-907f-cb8826f91572'),
	('00000000-0000-0000-0000-000000000000', 42, 'O5wAb1WmFyfBgny5MY_D_Q', 'b7b0fb72-91d2-4665-a39b-337070f64045', true, '2024-08-21 17:23:20.020604+00', '2024-08-21 21:44:17.287153+00', NULL, '001df0bf-db71-4340-9113-ef4abcc738e4');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: account; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."account" ("account_id", "created_via", "username", "created_at", "account_display_name") VALUES
	('322603863', 'web', 'exgenesis', '2011-06-23 13:04:14+00', '❤️‍🔥 xiq in NYC🔜 Aug 22');


--
-- Data for Name: archive_upload; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."archive_upload" ("id", "account_id", "archive_at", "created_at") OVERRIDING SYSTEM VALUE VALUES
	(1, '322603863', '2023-02-18 19:45:15+00', '2024-09-04 07:36:52.289755+00'),
	(8, '322603863', '2024-08-14 08:14:14+00', '2024-09-04 07:45:24.647197+00');


--
-- Data for Name: followers; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."followers" ("id", "account_id", "follower_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(2, '322603863', '1310630474755178496', 8),
	(3, '322603863', '1265789414023651328', 8),
	(1, '322603863', '1252851', 1),
	(22, '322603863', '1686843568214732800', 8);


--
-- Data for Name: following; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."following" ("id", "account_id", "following_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '322603863', '824308056351735809', 8),
	(2, '322603863', '18969923', 8),
	(3, '322603863', '3297675443', 8),
	(22, '322603863', '450679540', 8),
	(23, '322603863', '36223287', 8),
	(24, '322603863', '1712551744985772034', 8),
	(25, '322603863', '116624142', 8),;


--
-- Data for Name: liked_tweets; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."liked_tweets" ("tweet_id", "full_text") VALUES
	('1627038980352147458', 'They''re so flat they''re almost completely clear, except when the light catches them just right. You can read more in an article I wrote about them here: https://t.co/BhS444jEkF https://t.co/iFeHiZZdUn'),
	('1627038691825950720', 'Sea sapphires are some of the most beautiful animals on Earth.
Their bodies contain microscopic crystals that reflect blue light. They use this shine in courtship displays, &amp; in Japan, fishers call this tama-mizu: jeweled water.
📽️ https://t.co/NI2DioTKA4
https://t.co/Koww4X3sXB'),
	('1627039445253001219', 'https://t.co/erVoNQELZ2'),
	('1823637522087325732', 'I have absolutely no evidence for this but the vibes are telling me that chain of thought reasoning for LLMs should be considered suspicious possibly harmful'),
	('1823418209455988868', 'Thinking about starting a coffee meetup in SF. Like in the actual morning, before work. Just bump into whoever shows up, gossip and wake up together. Maybe in Lower Haight? Does anyone do this'),
	('1823347753755238619', 'Given that simple biological inspiration gave us high-quality, natural representations &amp; substantial adversarial robustness + interpretability + alignment for free, we believe that this decreases the likelihood that humans suffer from adversarial attacks of their own 
12/12');


--
-- Data for Name: likes; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '322603863', '1627038980352147458', 8),
	(2, '322603863', '1627038691825950720', 8),
	(3, '322603863', '1627039445253001219', 8),
	(22, '322603863', '1823637522087325732', 8),
	(23, '322603863', '1823418209455988868', 8),
	(24, '322603863', '1823347753755238619', 8);



--
-- Data for Name: mentioned_users; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
	('990430425825755138', '🪻bosco🪻', 'selentelechia', '2024-09-04 07:40:14.624+00'),
	('1248684884790587393', 'curious irrationalist {67/100 longform-ish things}', '42irrationalist', '2024-09-04 07:40:18.472+00'),
	('1460283925', 'roon', 'tszzl', '2024-09-04 07:44:54.851+00'),
	('2587393812', 'Mark 🟡⚪️🟣⚫️', 'meditationstuff', '2024-09-04 07:44:54.851+00'),
	('732980797985148928', 'Cam, afk', 'Empathy2000', '2024-09-04 07:45:03.834+00'),
	('36823', 'anildash.com', 'anildash', '2024-09-04 07:40:12.666+00'),
	('745273', 'Naval', 'naval', '2024-09-04 07:40:12.668+00'),
	('972651', 'Mashable', 'mashable', '2024-09-04 07:40:12.665+00'),
	('1652541', 'Reuters', 'Reuters', '2024-09-04 07:40:12.664+00'),
	('2063951', 'Love Pilgrim', 'tasshinfogleman', '2024-09-04 07:40:12.667+00'),
	('2561091', 'Público', 'Publico', '2024-09-04 07:40:12.666+00'),
	('4519121', 'The Oatmeal', 'Oatmeal', '2024-09-04 07:40:12.665+00');


--
-- Data for Name: tweets; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."tweets" ("tweet_id", "account_id", "created_at", "full_text", "retweet_count", "favorite_count", "reply_to_tweet_id", "reply_to_user_id", "reply_to_username", "archive_upload_id") VALUES
	('1627031510963441664', '322603863', '2023-02-18 19:45:15+00', 'Another lesson is: there''s a lot of trash, many not-very-contentful tweets, and it''s not trivial to separate them, but we can always train a classifier, or honestly just use an LLM w few-shot examples', 0, 3, '1627019761950375936', '322603863', 'exgenesis', 8),
	('1626922779105759235', '322603863', '2023-02-18 12:33:11+00', '@empathy2000 did NOT know but now I''m listening to her solo act bc of u', 0, 1, '1626916612560281601', '732980797985148928', 'Empathy2000', 8),
	('1626908498134020098', '322603863', '2023-02-18 11:36:27+00', '@empathy2000 I''m obsessed', 0, 1, '1626904491957133312', '732980797985148928', 'Empathy2000', 8),
	('1002962678732804102', '322603863', '2018-06-02 17:18:31+00', '@Diogoramooos ent', 0, 0, '1002956769952444416', '1173194520', 'jjjj__jjjj_jjj', 8),
	('1002956457950810118', '322603863', '2018-06-02 16:53:48+00', '@Diogoramooos Vai trabalhar crl Also guitarra amanhã', 0, 0, '1002956117872467968', '1173194520', 'jjjj__jjjj_jjj', 8);


--
-- Data for Name: tweet_media; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."tweet_media" ("media_id", "tweet_id", "media_url", "media_type", "width", "height", "archive_upload_id") VALUES
	(1627018396180140033, '1627019761950375936', 'https://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg', 'photo', 1176, 898, 8),
	(1822951237626576896, '1822951295336038785', 'https://pbs.twimg.com/media/GUxsfgGXQAArZAG.jpg', 'photo', 2048, 1214, 8),
	(1814423238409129985, '1814656545872818663', 'https://pbs.twimg.com/media/GS4gUnWXEAEgRmt.jpg', 'photo', 1536, 2048, 8),
	(1814298919746015232, '1814330871022759942', 'https://pbs.twimg.com/media/GS2vQUPWEAA1xGC.jpg', 'photo', 2048, 1153, 8),
	(1812643918271397888, '1814329297231909376', 'https://pbs.twimg.com/media/GSfOCjTWwAAE2Qc.jpg', 'photo', 682, 788, 8);


--
-- Data for Name: tweet_urls; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."tweet_urls" ("id", "url", "expanded_url", "display_url", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(1, 'https://t.co/5m0DjMETki', 'https://gnuboicavalo.bandcamp.com/releases', 'gnuboicavalo.bandcamp.com/releases', '1002676399659012097'),
	(2, 'https://t.co/Wi4yfWIX55', 'https://github.com/open-birdsite-db/open-birdsite-db', 'github.com/open-birdsite-…', '1823445398502994378'),
	(3, 'https://t.co/B7a1YIYy8O', 'https://x.com/settings/download_your_data', 'x.com/settings/downl…', '1823343756101243378'),
	(4, 'https://t.co/8cpVcsyTFT', 'https://twitter.com/rapazamoroso/status/1008811759602462726', 'twitter.com/rapazamoroso/s…', '1008832033546752000'),
	(5, 'https://t.co/6cVtcqQ3X1', 'https://twitter.com/simon_ohler/status/1812928707016757706', 'twitter.com/simon_ohler/st…', '1813859159399702849'),
	(6, 'https://t.co/drDYrW2NuM', 'https://twitter.com/ChuckBaggett/status/1756158852087611680', 'twitter.com/ChuckBaggett/s…', '1756170469466669524');


--
-- Data for Name: user_mentions; Type: TABLE DATA; Schema: dev; Owner: postgres
--

INSERT INTO "dev"."user_mentions" ("id", "mentioned_user_id", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '732980797985148928', '1626922779105759235'),
	(2, '732980797985148928', '1626908498134020098'),
	(3, '990430425825755138', '1626871062343327744'),
	(4, '2587393812', '1626871062343327744'),
	(5, '1248684884790587393', '1626745546156257281'),
	(6, '1460283925', '1626745546156257281'),
	(43, '976267215812034560', '1823634222805864549'),
	(44, '1170064144411897857', '1823634131403583929');


--
-- Data for Name: key; Type: TABLE DATA; Schema: pgsodium; Owner: supabase_admin
--



--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."account" ("account_id", "created_via", "username", "created_at", "account_display_name") VALUES
	('752422021', 'web', '_brentbaum', '2012-08-12 03:57:42+00', 'brent'),
	('595692178', 'web', 'zencephalon', '2012-05-31 17:57:57+00', 'zen eth/acc'),
	('1680757426889342977', 'oauth:3033300', 'DefenderOfBasic', '2023-07-17 01:53:20.404+00', 'Defender'),
	('3434231452', 'oauth:268278', 'bierlingm', '2015-08-21 13:20:44.059+00', 'Moritz Bierling'),
	('1796120648281923584', 'oauth:3033300', 'emergentvibe', '2024-05-30 10:05:36.689+00', 'Emergent'),
	('1133288553859887106', 'oauth:258901', 'FriedKielbasa', '2019-05-28 08:27:01.539+00', 'Fred'),
	('2063951', 'web', 'tasshinfogleman', '2007-03-23 23:35:59+00', 'Love Pilgrim'),
	('1223231444429856769', 'oauth:3033300', 'the_wilderless', '2020-01-31 13:08:10.747+00', 'River Kenna'),
	('1335851599483133953', 'oauth:3033300', 'nobu_hibiki', '2020-12-07 07:40:25.781+00', 'boy'),
	('1635244909983662081', 'oauth:3033300', 'dpinkshadow', '2023-03-13 11:42:30.274+00', 'doaks (only gm)'),
	('1166420252898603008', 'oauth:3033300', 'euxenus', '2019-08-27 18:40:49.489+00', 'exns'),
	('1260820328617578501', 'oauth:3033300', 'moissanist', '2020-05-14 06:32:51.349+00', 'moissanist'),
	('973083181640335360', 'oauth:268278', 'br___ian', '2018-03-12 06:28:04.324+00', 'b'),
	('359242457', 'web', 'AlexKrusz', '2011-08-21 07:35:22+00', 'Alex Krusz | krusz.eth'),
	('1456268838970945536', 'oauth:3033300', 'nido_kween', '2021-11-04 14:36:01.057+00', '🅱️ in NYC'),
	('1915273423', 'web', 'loopholekid', '2013-09-28 20:29:44.102+00', 'active resonator'),
	('18280363', 'web', 'TylerAlterman', '2008-12-21 06:17:31+00', 'Tyler Alterman'),
	('19607314', 'web', 'rickbenger', '2009-01-27 18:39:02+00', 'Rick Benger'),
	('322603863', 'web', 'exGenesis', '2011-06-23 13:04:14+00', '❤️‍🔥 xiq');


--
-- Data for Name: archive_upload; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."archive_upload" ("id", "account_id", "archive_at", "created_at") OVERRIDING SYSTEM VALUE VALUES
	(2, '752422021', '2024-07-19 22:39:23+00', '2024-08-30 21:30:43.329167+00'),
	(3, '595692178', '2024-08-27 15:48:09+00', '2024-08-30 21:30:43.329167+00'),
	(4, '1680757426889342977', '2024-08-16 17:13:11+00', '2024-08-30 21:30:43.329167+00'),
	(10, '3434231452', '2024-08-30 05:42:33+00', '2024-09-03 11:53:33.388353+00'),
	(17, '1796120648281923584', '2024-08-21 16:48:16+00', '2024-09-04 07:53:14.568386+00'),
	(18, '322603863', '2024-08-14 08:14:14+00', '2024-09-04 07:55:11.301902+00'),
	(19, '1133288553859887106', '2024-08-27 03:47:21+00', '2024-09-04 15:25:30.282614+00'),
	(20, '2063951', '2024-09-05 08:16:00+00', '2024-09-05 08:55:51.218273+00'),
	(24, '1223231444429856769', '2024-09-05 06:44:48+00', '2024-09-05 17:45:28.638983+00'),
	(25, '1335851599483133953', '2024-08-14 12:23:59+00', '2024-09-05 18:08:01.863652+00'),
	(30, '1635244909983662081', '2024-08-25 13:19:24+00', '2024-09-06 10:30:36.973493+00'),
	(31, '1166420252898603008', '2024-07-16 21:36:19+00', '2024-09-06 15:13:01.24341+00'),
	(32, '1260820328617578501', '2024-08-20 12:11:50+00', '2024-09-06 18:12:23.770464+00'),
	(33, '973083181640335360', '2024-08-14 05:13:38+00', '2024-09-06 18:15:15.799644+00'),
	(36, '359242457', '2024-09-06 01:26:53+00', '2024-09-06 18:31:28.999222+00'),
	(37, '1456268838970945536', '2024-09-04 14:26:16+00', '2024-09-06 18:59:01.394029+00'),
	(38, '1915273423', '2024-09-06 17:40:30+00', '2024-09-06 21:20:44.883333+00'),
	(39, '18280363', '2024-08-20 16:16:18+00', '2024-09-06 22:42:10.843895+00'),
	(40, '19607314', '2024-09-06 09:12:50+00', '2024-09-07 12:09:43.05629+00'),
	(21, '322603863', '2023-02-18 19:45:15+00', '2024-09-07 15:05:39.681816+00');


--
-- Data for Name: followers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."followers" ("id", "account_id", "follower_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(21384, '1796120648281923584', '1732910562911121408', 17),
	(21385, '1796120648281923584', '345709253', 17),
	(21386, '1796120648281923584', '129389222', 17),
	(21387, '1796120648281923584', '1678472988687998981', 17),
	(21388, '1796120648281923584', '1759011737414643712', 17),
	(21389, '1796120648281923584', '195595536', 17),
	(21390, '1796120648281923584', '1725353552275820544', 17),
	(21391, '1796120648281923584', '1246754469741805568', 17),
	(21392, '1796120648281923584', '1753813821783785472', 17),
	(21393, '1796120648281923584', '1685677931018797056', 17),
	(21394, '1796120648281923584', '1020375143921532928', 17),
	(21395, '1796120648281923584', '1745857188080615424', 17),
	(21396, '1796120648281923584', '1463167815549079556', 17),
	(21397, '1796120648281923584', '1042039502141833217', 17),
	(21398, '1796120648281923584', '1698791578981085184', 17),
	(21399, '1796120648281923584', '1746043716471488512', 17),
	(21400, '1796120648281923584', '1619481762530222081', 17),
	(21401, '1796120648281923584', '65421745', 17),
	(21402, '1796120648281923584', '322878498', 17);


--
-- Data for Name: liked_tweets; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."liked_tweets" ("tweet_id", "full_text") VALUES
	('1823637522087325732', 'I have absolutely no evidence for this but the vibes are telling me that chain of thought reasoning for LLMs should be considered suspicious possibly harmful'),
	('1823418209455988868', 'Thinking about starting a coffee meetup in SF. Like in the actual morning, before work. Just bump into whoever shows up, gossip and wake up together. Maybe in Lower Haight? Does anyone do this'),
	('1823347753755238619', 'Given that simple biological inspiration gave us high-quality, natural representations &amp; substantial adversarial robustness + interpretability + alignment for free, we believe that this decreases the likelihood that humans suffer from adversarial attacks of their own 
12/12'),
	('1823347741168136382', 'We can flip this around &amp; re-purpose the multi-resolution prior to turn pre-trained classifiers &amp; CLIP models into controllable image generators for free! 

Just express the attack perturbation as a sum over resolutions =&gt; natural looking images instead of noisy attacks! 8/12 https://t.co/xUeReNa1Nh'),
	('1823347735145128187', 'Having to attack 🔎 all resolutions &amp; 🪜all abstractions at once leads naturally to human-interpretable attacks 

We call this the Interpretability-Robustness Hypothesis. We can clearly see why the attack perturbation does what it does - we get much better alignment  6/12 https://t.co/Hfub1IM8iY'),
	('1823347729990303816', 'We use this as an active adversarial defense by combining intermediate layer predictions into a self-ensemble

We do this via our new, Vickrey auction &amp; balanced allocation inspired robust ensembling procedure we call CrossMax which behaves in an anti-Goodhart way 4/12 https://t.co/gYaVvhHU32'),
	('1823347732653687002', 'To fool our network, you need to confuse it 
1) 🔎 at all resolutions &amp; 
2) 🪜at all abstraction scales 
➡️ much harder to attack 
➡️ matches or beats SOTA (=brute force) on CIFAR-10/100 adversarial accuracy cheaply w/o any adversarial training. With it, it''s even better!  5/12 https://t.co/NqBL2jBk1I'),
	('1823347721358438624', '✨🎨🏰Super excited to share our new paper Ensemble everything everywhere: Multi-scale aggregation for adversarial robustness

Inspired by biology we 1) get adversarial robustness + interpretability for free, 2) turn classifiers into generators &amp; 3) design attacks on vLLMs 1/12 https://t.co/kiLjXTqaNP'),
	('1823697653320048788', 'This is really cool paper. While it is mostly written in ''adversarial robustness'' frame, and seems to solve most of adversarial robustness in images, I think there is more you can learn from it

a. Representational alignment / natural abstractions: I think this is some evidence… https://t.co/BAmvJzw1Qj'),
	('1823690664862998844', '@danallison @exgenesis @egrecho i''m excited for projects like these. i too have something like this in the work, and would love to contribute to more projects like these
https://t.co/iqSq1M75CJ'),
	('1795738716604174362', 'breathing more life into this project. here''s the first page.

i am imagining a beautiful coffee table book with a lot of warmth, wisdom and wholesomeness ✨

(thank you @evolvingwaterbb for the background) https://t.co/Tra2ljNoQW https://t.co/AnkKTmhSTa'),
	('1823508283300127187', 'I''ve just been informed that a man whose voice is on the golden record that we shot into space with all of our art representing humanity just hangs out at my local Panera Bread 

he''s 85'),
	('1822966303642308903', 'The single most undervalued fact of linear algebra:

Matrices are graphs, and graphs are matrices.

Encoding matrices as graphs is a cheat code, making complex behavior simple to study.

Let me show you how! https://t.co/gGDkhYIfKt'),
	('1823660333564657844', '@visakanv adolescent isn''t as descriptive but it''s better imo!'),
	('1823552071452242220', 'The plan isn''t that important in the end. But the plan allows you to take action &amp; the action will generate better plans. This feedback loop is the important part.

You just have to start somewhere &amp; dive in. https://t.co/I2nnM2rIHT'),
	('1823671598911463631', '@_samand_ @So8res curiously this is a great relationship advice'),
	('1823552064363938254', 'there is a blog post called by @So8res that helped me develop more agency &amp; take imperfect action toward a goal

the main takeaway is if you''re ambitious and want to do something important, you have to get your hands dirty and try things https://t.co/YzgNt4sQuM'),
	('1823552068868604085', 'Alice''s plan is bad. But it''s better than Bob''s.

Why? Because Alice will be in the arena _trying things_.

Alice will be out there "bumping into the world" — I love this phrase. I think about it all the time. I want to bump into things!!! https://t.co/GeFbBrrv8d'),
	('1823478439875060100', 'the problem is not that insight is hard to get— the problem is it’s fucking scary'),
	('1823626245348688380', 'this portal retrospective ain''t gonna write itself folks'),
	('1823632275453469080', 'omg i need to leave my job NOW i''m suffering'),
	('1823655030404116482', '@nido_kween @exgenesis 😂😂😂'),
	('1823654543067865491', '@TheJointleman @exgenesis same'),
	('1823604571845091426', 'the cool thing is i missed 6 months of random news events and discourse cycles and i''m betting none of it mattered in the slightest because nobody thought any of it was worth telling me about so far'),
	('1823460973921099858', 'so i''ve been thinking a little bit about how i''d go about introducing someone to math, a few people in portland have expressed interest in something like this. the rest of this will be some messy thinking out loud. a major thing is that there''s this large and imo very…'),
	('1823502663180238904', '@TylerAlterman Everything I do is about getting strangers with the same values (curious, kind, open-minded) to find each other. 

I’ve hosted 107 walks in Austin, @adele_bloch has hosted 53 walks in SF, and I just started a free gratitude call called Great Morning every week day at 8 AM CT. 🥰'),
	('1823631704419942834', '@exgenesis For a moment there I though you meant your marriage proposal and was like, damn this mf really do be building in public'),
	('1823588002075173033', '@exgenesis Too bad threadhelper didn''t use the keys to make a copy of the local twitter ball'),
	('1823554451824955570', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin @AbstractFairy nice'),
	('1823553775480500390', '@_deepfates @exgenesis @_brentbaum @Tangrenin @AbstractFairy I agree!

https://t.co/ZkZN2itR7L');
INSERT INTO "public"."liked_tweets" ("tweet_id", "full_text") VALUES
	('1823637522087325732', 'I have absolutely no evidence for this but the vibes are telling me that chain of thought reasoning for LLMs should be considered suspicious possibly harmful'),
	('1823418209455988868', 'Thinking about starting a coffee meetup in SF. Like in the actual morning, before work. Just bump into whoever shows up, gossip and wake up together. Maybe in Lower Haight? Does anyone do this'),
	('1823347753755238619', 'Given that simple biological inspiration gave us high-quality, natural representations &amp; substantial adversarial robustness + interpretability + alignment for free, we believe that this decreases the likelihood that humans suffer from adversarial attacks of their own 
12/12'),
	('1823347741168136382', 'We can flip this around &amp; re-purpose the multi-resolution prior to turn pre-trained classifiers &amp; CLIP models into controllable image generators for free! 

Just express the attack perturbation as a sum over resolutions =&gt; natural looking images instead of noisy attacks! 8/12 https://t.co/xUeReNa1Nh'),
	('1823347735145128187', 'Having to attack 🔎 all resolutions &amp; 🪜all abstractions at once leads naturally to human-interpretable attacks 

We call this the Interpretability-Robustness Hypothesis. We can clearly see why the attack perturbation does what it does - we get much better alignment  6/12 https://t.co/Hfub1IM8iY'),
	('1823347729990303816', 'We use this as an active adversarial defense by combining intermediate layer predictions into a self-ensemble

We do this via our new, Vickrey auction &amp; balanced allocation inspired robust ensembling procedure we call CrossMax which behaves in an anti-Goodhart way 4/12 https://t.co/gYaVvhHU32'),
	('1823347732653687002', 'To fool our network, you need to confuse it 
1) 🔎 at all resolutions &amp; 
2) 🪜at all abstraction scales 
➡️ much harder to attack 
➡️ matches or beats SOTA (=brute force) on CIFAR-10/100 adversarial accuracy cheaply w/o any adversarial training. With it, it''s even better!  5/12 https://t.co/NqBL2jBk1I'),
	('1823347721358438624', '✨🎨🏰Super excited to share our new paper Ensemble everything everywhere: Multi-scale aggregation for adversarial robustness

Inspired by biology we 1) get adversarial robustness + interpretability for free, 2) turn classifiers into generators &amp; 3) design attacks on vLLMs 1/12 https://t.co/kiLjXTqaNP'),
	('1823697653320048788', 'This is really cool paper. While it is mostly written in ''adversarial robustness'' frame, and seems to solve most of adversarial robustness in images, I think there is more you can learn from it

a. Representational alignment / natural abstractions: I think this is some evidence… https://t.co/BAmvJzw1Qj'),
	('1823690664862998844', '@danallison @exgenesis @egrecho i''m excited for projects like these. i too have something like this in the work, and would love to contribute to more projects like these
https://t.co/iqSq1M75CJ'),
	('1795738716604174362', 'breathing more life into this project. here''s the first page.

i am imagining a beautiful coffee table book with a lot of warmth, wisdom and wholesomeness ✨

(thank you @evolvingwaterbb for the background) https://t.co/Tra2ljNoQW https://t.co/AnkKTmhSTa'),
	('1823508283300127187', 'I''ve just been informed that a man whose voice is on the golden record that we shot into space with all of our art representing humanity just hangs out at my local Panera Bread 

he''s 85'),
	('1822966303642308903', 'The single most undervalued fact of linear algebra:

Matrices are graphs, and graphs are matrices.

Encoding matrices as graphs is a cheat code, making complex behavior simple to study.

Let me show you how! https://t.co/gGDkhYIfKt'),
	('1823660333564657844', '@visakanv adolescent isn''t as descriptive but it''s better imo!'),
	('1823552071452242220', 'The plan isn''t that important in the end. But the plan allows you to take action &amp; the action will generate better plans. This feedback loop is the important part.

You just have to start somewhere &amp; dive in. https://t.co/I2nnM2rIHT'),
	('1823671598911463631', '@_samand_ @So8res curiously this is a great relationship advice'),
	('1823552064363938254', 'there is a blog post called by @So8res that helped me develop more agency &amp; take imperfect action toward a goal

the main takeaway is if you''re ambitious and want to do something important, you have to get your hands dirty and try things https://t.co/YzgNt4sQuM'),
	('1823552068868604085', 'Alice''s plan is bad. But it''s better than Bob''s.

Why? Because Alice will be in the arena _trying things_.

Alice will be out there "bumping into the world" — I love this phrase. I think about it all the time. I want to bump into things!!! https://t.co/GeFbBrrv8d'),
	('1823478439875060100', 'the problem is not that insight is hard to get— the problem is it’s fucking scary'),
	('1823626245348688380', 'this portal retrospective ain''t gonna write itself folks'),
	('1823632275453469080', 'omg i need to leave my job NOW i''m suffering'),
	('1823655030404116482', '@nido_kween @exgenesis 😂😂😂'),
	('1823654543067865491', '@TheJointleman @exgenesis same'),
	('1823604571845091426', 'the cool thing is i missed 6 months of random news events and discourse cycles and i''m betting none of it mattered in the slightest because nobody thought any of it was worth telling me about so far'),
	('1823460973921099858', 'so i''ve been thinking a little bit about how i''d go about introducing someone to math, a few people in portland have expressed interest in something like this. the rest of this will be some messy thinking out loud. a major thing is that there''s this large and imo very…'),
	('1823502663180238904', '@TylerAlterman Everything I do is about getting strangers with the same values (curious, kind, open-minded) to find each other. 

I’ve hosted 107 walks in Austin, @adele_bloch has hosted 53 walks in SF, and I just started a free gratitude call called Great Morning every week day at 8 AM CT. 🥰'),
	('1823631704419942834', '@exgenesis For a moment there I though you meant your marriage proposal and was like, damn this mf really do be building in public'),
	('1823588002075173033', '@exgenesis Too bad threadhelper didn''t use the keys to make a copy of the local twitter ball'),
	('1823554451824955570', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin @AbstractFairy nice'),
	('1823553775480500390', '@_deepfates @exgenesis @_brentbaum @Tangrenin @AbstractFairy I agree!

https://t.co/ZkZN2itR7L');



--
-- Data for Name: likes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(747024, '1796120648281923584', '1826310911050629401', 17),
	(747025, '1796120648281923584', '1826257777892983255', 17),
	(747026, '1796120648281923584', '1826204870694916186', 17),
	(747027, '1796120648281923584', '1826296964881027483', 17),
	(747028, '1796120648281923584', '1825774665144340827', 17),
	(747029, '1796120648281923584', '1826024905227244030', 17),
	(747030, '1796120648281923584', '1826139046483013948', 17),
	(747031, '1796120648281923584', '1826078098481361307', 17),
	(747032, '1796120648281923584', '1826282730193318175', 17),
	(747033, '1796120648281923584', '1826271289017028776', 17),
	(747034, '1796120648281923584', '1826266593950564355', 17),
	(747035, '1796120648281923584', '1826265722634502301', 17),
	(747036, '1796120648281923584', '1826264433578148064', 17),
	(747037, '1796120648281923584', '1825928781367791868', 17),
	(747038, '1796120648281923584', '1826257231786242482', 17);

    

--
-- Data for Name: mentioned_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
	('29961293', 'Geger Riyanto', 'gegerriy', '2024-09-05 18:06:03.635+00'),
	('15633111', 'Mason Currey', 'masoncurrey', '2024-09-04 15:25:09.757+00'),
	('44833706', 'synaptic stimuli', 'lindaraharja', '2024-09-05 18:06:03.634+00'),
	('10545', 'Mike Rundle', 'flyosity', '2024-09-03 11:52:44.385+00'),
	('21195588', 'Tim Pastoor', 'timpastoor', '2024-09-04 15:25:09.757+00'),
	('46991136', 'Gauchienne', 'gaucheian', '2024-09-05 18:06:03.637+00'),
	('24490384', 'Damian', 'BEEPLEofWALMART', '2024-09-04 15:25:09.757+00'),
	('182383', 'Ben Gold', 'bengold', '2024-09-06 18:29:53.843+00'),
	('53044984', 'Harbowoputra', 'harbowoputra', '2024-09-05 18:06:03.633+00'),
	('57816604', 'Maybe: Hegar', 'HPEgieara', '2024-09-05 18:06:03.636+00'),
	('74731503', 'Liam 🔻', 'cluelessdirectr', '2024-09-05 18:06:03.635+00'),
	('93421683', 'Yihui is returning to self', 'empirepowder', '2024-09-05 18:06:03.635+00'),
	('1106554797879119872', 'Victor', 'notnaughtknot', '2024-07-14 20:59:36+00'),
	('70894158', 'Ryan Abel', 'GeneralAntilles', '2024-09-04 15:25:09.758+00'),
	('110451384', 'Matt S "unpredictably hypergolic" Trout (mst)', 'shadowcat_mst', '2024-09-04 15:25:09.756+00'),
	('122484263', 'Urban Composition', 'urban_comp', '2024-09-04 15:25:09.758+00'),
	('100686498', 'Winda', 'windaul', '2024-09-05 18:06:03.634+00');

	
INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
	('29961293', 'Geger Riyanto', 'gegerriy', '2024-09-05 18:06:03.635+00'),
	('15633111', 'Mason Currey', 'masoncurrey', '2024-09-04 15:25:09.757+00'),
	('44833706', 'synaptic stimuli', 'lindaraharja', '2024-09-05 18:06:03.634+00'),
	('10545', 'Mike Rundle', 'flyosity', '2024-09-03 11:52:44.385+00'),
	('21195588', 'Tim Pastoor', 'timpastoor', '2024-09-04 15:25:09.757+00'),
	('46991136', 'Gauchienne', 'gaucheian', '2024-09-05 18:06:03.637+00'),
	('24490384', 'Damian', 'BEEPLEofWALMART', '2024-09-04 15:25:09.757+00'),
	('182383', 'Ben Gold', 'bengold', '2024-09-06 18:29:53.843+00'),
	('53044984', 'Harbowoputra', 'harbowoputra', '2024-09-05 18:06:03.633+00'),
	('57816604', 'Maybe: Hegar', 'HPEgieara', '2024-09-05 18:06:03.636+00'),
	('74731503', 'Liam 🔻', 'cluelessdirectr', '2024-09-05 18:06:03.635+00'),
	('93421683', 'Yihui is returning to self', 'empirepowder', '2024-09-05 18:06:03.635+00'),
	('1106554797879119872', 'Victor', 'notnaughtknot', '2024-07-14 20:59:36+00'),
	('70894158', 'Ryan Abel', 'GeneralAntilles', '2024-09-04 15:25:09.758+00'),
	('110451384', 'Matt S "unpredictably hypergolic" Trout (mst)', 'shadowcat_mst', '2024-09-04 15:25:09.756+00'),
	('122484263', 'Urban Composition', 'urban_comp', '2024-09-04 15:25:09.758+00'),
	('100686498', 'Winda', 'windaul', '2024-09-05 18:06:03.634+00');




--
-- Data for Name: profile; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profile" ("id", "account_id", "bio", "website", "location", "avatar_media_url", "header_media_url", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(136, '1260820328617578501', 'awareness is all you need

||

grow me by leaving anon feedback, please
https://t.co/L3NaHvENXt', '', '', 'https://pbs.twimg.com/profile_images/1809733950384009217/51PLkTE2.jpg', 'https://pbs.twimg.com/profile_banners/1260820328617578501/1720307223', 32),
	(137, '973083181640335360', 'just looking', 'https://t.co/bXNKcuQxpo', 'seaside', 'https://pbs.twimg.com/profile_images/1604311528961806337/YDY57Rby.jpg', 'https://pbs.twimg.com/profile_banners/973083181640335360/1671332650', 33),
	(89, '1680757426889342977', 'Mostly just trying to understand what is going on in the world & have a good time.

all ideas I post are public domain please steal them', 'https://t.co/BUIfhuwKnW', 'Upstate NY', 'https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_normal.jpg', 'https://pbs.twimg.com/profile_banners/1680757426889342977/1689949048', 4),
	(51, '752422021', 'founder build an ifs self-therapy companion (https://t.co/tSUiaarL7D). music producer. phenomenology appreciator. chopper and carrier.', '', '', 'https://pbs.twimg.com/profile_images/1762853337496440832/atyjNDTU_normal.jpg', 'https://pbs.twimg.com/profile_banners/752422021/1705408059', 2),
	(140, '359242457', 'Good Thoughts made with Real Words', '', 'San Diego, CA', 'https://pbs.twimg.com/profile_images/1675303916169469952/x5X_fdw0.jpg', 'https://pbs.twimg.com/profile_banners/359242457/1457919227', 36),
	(83, '595692178', 'Poly-unsaturated 💞 psychedelic 🍄 meditating 🪷 ethereum 🦇🔊 ninja 🥷', 'https://t.co/jMAdRP6oVP', 'New York City', 'https://pbs.twimg.com/profile_images/1603043706172542982/OVE2nDEB_normal.jpg', 'https://pbs.twimg.com/profile_banners/595692178/1653186691', 3),
	(141, '1456268838970945536', 'babies, movement & other thoughts. helping parents bring montessori home ✨ book me below:', 'https://t.co/FdyYH15sbJ', 'Portugal', 'https://pbs.twimg.com/profile_images/1626722334827487233/hy_tLf9m.jpg', 'https://pbs.twimg.com/profile_banners/1456268838970945536/1715720420', 37),
	(121, '1796120648281923584', 'how do i escape c̵a̵p̵i̵t̵a̵l̵i̵s̵m̵ 𝓼𝓪𝓶𝓼𝓪𝓻𝓪   ||  i do ML&CV & i make bad paintings 

https://t.co/cMHODUP1o1', 'https://t.co/K2PmeKM3p4', 'Here, now', 'https://pbs.twimg.com/profile_images/1823129449581162496/uh51rUBL.jpg', 'https://pbs.twimg.com/profile_banners/1796120648281923584/1723330671', 17),
	(122, '322603863', '(chic) multiscale coordination refactor; manifesto: https://t.co/KbBVqjMWDh', 'https://t.co/35SNj4BEf9', 'Porto, Portugal', 'https://pbs.twimg.com/profile_images/1821642872485036032/H3_k2cQh.jpg', 'https://pbs.twimg.com/profile_banners/322603863/1671291348', 18),
	(123, '1133288553859887106', 'professional chatgpt user
alt: @prefadesso', 'https://t.co/xEUyylThoo', 'Brooklyn, NY', 'https://pbs.twimg.com/profile_images/1828062814289678336/RJQQ8DPI.jpg', 'https://pbs.twimg.com/profile_banners/1133288553859887106/1607970106', 19),
	(124, '2063951', '❤️❓🪄  | draftposts on Sundays, funprofessional posts 🔞 | pfp by @this_is_silvia, header by @s0uldirect0r | https://t.co/d7yFiH3NZT & https://t.co/SubJVZFBtw', 'https://t.co/tZUnqbe3dW', ' 🎽👉🏻⚡️❤️🌍', 'https://pbs.twimg.com/profile_images/1743798797262852096/z7ihMbpI.jpg', 'https://pbs.twimg.com/profile_banners/2063951/1707441770', 20),
	(142, '1915273423', 'transduction coherence broadcast / artist-engineer-clinician', 'https://t.co/wEpt6vO8N0', 'Toronto, Ontario', 'https://pbs.twimg.com/profile_images/1603899311611383810/Q5QBbaY-.jpg', 'https://pbs.twimg.com/profile_banners/1915273423/1675488872', 38),
	(143, '18280363', 'Breathe in the evening sun. Breathe out the doing of taxes. Venture culturalist. Epistemic status: Oboe. University: @fractal_nyc Sci-fi/fantasy: @psychofauna', 'https://t.co/WOcyftC7Cs', 'New York', 'https://pbs.twimg.com/profile_images/1823562171474960386/gt09OLeI.jpg', 'https://pbs.twimg.com/profile_banners/18280363/1595939882', 39),
	(128, '1223231444429856769', 'All I want is a simple life of love & valor • & to be a renowned scholar-poet of the world-heart • Who is wealthy • & jacked • Like a hot Jung • https://t.co/00oTvUzIHX', 'https://t.co/igc4toDrLd', 'alam al-mithal', 'https://pbs.twimg.com/profile_images/1683472737262551040/jSjeHVjq.jpg', 'https://pbs.twimg.com/profile_banners/1223231444429856769/1706979661', 24),
	(129, '1335851599483133953', 'stories (feminine) and logistics (masculine) is fighting inside me. i guess that''s drama (?) for you.', '', 'lost at sea alone', 'https://pbs.twimg.com/profile_images/1806231198630604800/887dBQqp.jpg', 'https://pbs.twimg.com/profile_banners/1335851599483133953/1719474027', 25),
	(144, '19607314', 'technoromantic hopemonger. I write about community, soulful living, and a beautiful re-bundling of life.', 'https://t.co/VSaEig1XhT', 'Berlin', 'https://pbs.twimg.com/profile_images/1769025516546269184/WsqbtoEs.jpg', 'https://pbs.twimg.com/profile_banners/19607314/1725122632', 40),
	(114, '3434231452', 'Meta Missionary. The Statecraft Guy. Let there be Light.', 'https://t.co/kwApYdD5aX', 'Hamburg', 'https://pbs.twimg.com/profile_images/1695013242911784960/__5W-sDs.jpg', NULL, 10),
	(125, '322603863', 'negentropy', 'https://t.co/n44CGMQVGL', 'Porto, Portugal ', 'https://pbs.twimg.com/profile_images/1562836797494906880/K_O23TKw.jpg', 'https://pbs.twimg.com/profile_banners/322603863/1671291348', 21),
	(134, '1635244909983662081', 'seeker of the syzygy / all of the contradictions expressed here are my own', 'https://t.co/Xa2kiv4xMA', '', 'https://pbs.twimg.com/profile_images/1766875710285664257/Ex8j_ogS.jpg', 'https://pbs.twimg.com/profile_banners/1635244909983662081/1705685560', 30),
	(135, '1166420252898603008', 'building a Second Brain, dissecting the Global Brain, and merging with the two', 'https://t.co/hm9ohDtYCP', '', 'https://pbs.twimg.com/profile_images/1379584452918185987/qdOOQaVQ.jpg', 'https://pbs.twimg.com/profile_banners/1166420252898603008/1617753424', 31);


--
-- Data for Name: tweets; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tweets" ("tweet_id", "account_id", "created_at", "full_text", "retweet_count", "favorite_count", "reply_to_tweet_id", "reply_to_user_id", "reply_to_username", "archive_upload_id") VALUES
	('1826300297355964532', '1796120648281923584', '2024-08-21 16:48:16+00', 'more illegibility is required', 0, 0, '1826262233787339069', '1796120648281923584', 'emergentvibe', 17),
	('1826293049888268345', '1796120648281923584', '2024-08-21 16:19:28+00', '@loopholekid what is your favourite hyperobject to access', 0, 0, '1826283311989408134', '1915273423', 'loopholekid', 17),
	('1826283256230322499', '1796120648281923584', '2024-08-21 15:40:33+00', '@IaimforGOAT ahh, a fellow tab enthusiast, hello', 0, 0, '1826282730193318175', '345709253', 'IaimforGOAT', 17),
	('1826282299958182109', '1796120648281923584', '2024-08-21 15:36:45+00', 'how much of tpot do you think cargo-cults enlightenment?', 0, 0, NULL, NULL, NULL, 17),
	('1826279259629121889', '1796120648281923584', '2024-08-21 15:24:40+00', 'do other adhd people get hyperfocus fantasies

like - i could hyperfocus on this for a month and get  good, but i never do it cause my hyperfocus never lasts that long', 0, 3, NULL, NULL, NULL, 17),
	('1826278242824954196', '1796120648281923584', '2024-08-21 15:20:38+00', 'i''m okay with the pile of clothes on the floor
i am the pile of clothes on the floor', 0, 1, NULL, NULL, NULL, 17),
	('1826265989094511029', '1796120648281923584', '2024-08-21 14:31:56+00', '@s01101010 just tag me next time', 0, 0, '1826265722634502301', '1789313511031463936', 's01101010', 17),
	('1826262488335429979', '1796120648281923584', '2024-08-21 14:18:02+00', '@the_wilderless lobotomise that mf', 0, 1, '1826224037409783812', '1223231444429856769', 'the_wilderless', 17),
	('1826262233787339069', '1796120648281923584', '2024-08-21 14:17:01+00', 'chatGPT gave it a "A-" | apparently it doesn''t cause enough of an emotional impact to the machine - also it said it was too abstract? yay go me?', 0, 0, '1826262231543386391', '1796120648281923584', 'emergentvibe', 17),
	('1826262231543386391', '1796120648281923584', '2024-08-21 14:17:00+00', 'i posted and deleted it last night cause i cringe sooooooo much but got to work through the pain', 0, 1, '1826262228494131479', '1796120648281923584', 'emergentvibe', 17),
	('1826262228494131479', '1796120648281923584', '2024-08-21 14:17:00+00', 'here''s some poetry from last night, maybe one of you can decypher it https://t.co/mHgjtUgxaA', 0, 2, NULL, NULL, NULL, 17),
	('1826259465991246176', '1796120648281923584', '2024-08-21 14:06:01+00', '@frideswyth also that weed sent us to space and im not sure if it was the strain research i did or the moon magic', 0, 1, '1826259175044948331', '1796120648281923584', 'emergentvibe', 17),
	('1826259175044948331', '1796120648281923584', '2024-08-21 14:04:52+00', '@frideswyth SYSTEMATISE WOO - BE BOTH', 0, 2, '1826257231786242482', '185214623', 'frideswyth', 17),
	('1826258946249892248', '1796120648281923584', '2024-08-21 14:03:57+00', '@the_wilderless you can just do things bro', 0, 0, '1826253680682979746', '1223231444429856769', 'the_wilderless', 17),
	('1826258717840748911', '1796120648281923584', '2024-08-21 14:03:03+00', '@river_kenna we''ll tag each other 🫂', 0, 1, '1826254502703628449', '1463167815549079556', 'river_kenna', 17),
	('1826248261847670978', '1796120648281923584', '2024-08-21 13:21:30+00', 'the urge to send "checkin queeeens" to my work chat in the morning is too much', 0, 3, NULL, NULL, NULL, 17),
	('1826214600074776856', '1796120648281923584', '2024-08-21 11:07:44+00', 'seems like a worthwhile project', 0, 0, NULL, NULL, NULL, 17);


--
-- Data for Name: tweet_media; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tweet_media" ("media_id", "tweet_id", "media_url", "media_type", "width", "height", "archive_upload_id") VALUES
	(1826259686267449344, '1826262228494131479', 'https://pbs.twimg.com/media/GVgtgjuWcAA7kdB.png', 'photo', 628, 707, 17),
	(1826030703059824640, '1826167490415673607', 'https://pbs.twimg.com/media/GVddP-zWcAAba5E.jpg', 'photo', 1169, 864, 17),
	(1823328418655559681, '1823329522600624291', 'https://pbs.twimg.com/media/GU3DiU7W4AE3mFe.png', 'photo', 800, 800, 17),
	(1822715707315912704, '1822715787192242512', 'https://pbs.twimg.com/media/GUuWR1UXAAAjkoV.jpg', 'photo', 2048, 1357, 17),
	(1822021683131170817, '1822021690240430466', 'https://pbs.twimg.com/tweet_video_thumb/GUkfETwXwAE9rzd.jpg', 'photo', 340, 340, 17),
	(1821840604113915904, '1821840607163167107', 'https://pbs.twimg.com/media/GUh6YH2X0AAoPyf.jpg', 'photo', 1683, 2048, 17),
	(1820876513597644800, '1820876526671245620', 'https://pbs.twimg.com/media/GUUNiqzW4AAf_W1.jpg', 'photo', 1405, 2048, 17),
	(1817857586743431168, '1817857590107210103', 'https://pbs.twimg.com/media/GTpT1_4XUAAwgL_.jpg', 'photo', 1536, 2048, 17),
	(1817190635897606144, '1817190648509804922', 'https://pbs.twimg.com/media/GTf1QWXX0AA4R5D.jpg', 'photo', 1536, 2048, 17),
	(1817185196090728448, '1817185210884125084', 'https://pbs.twimg.com/media/GTfwTtgWIAAPtxo.jpg', 'photo', 1536, 2048, 17),
	(1816024314900070400, '1816024318108684668', 'https://pbs.twimg.com/media/GTPQfiEXQAAKl70.jpg', 'photo', 2048, 1152, 17),
	(1815040998793191424, '1815041015079686568', 'https://pbs.twimg.com/media/GTBSLAHWoAAkNRL.jpg', 'photo', 1996, 2048, 17),
	(1831577305530908672, '1831577311969218911', 'https://pbs.twimg.com/media/GWsR2vLWQAAAf_v.jpg', 'photo', 320, 500, 24),
	(1814070693585113088, '1814070696441475290', 'https://pbs.twimg.com/media/GSzfrziWUAA-b52.jpg', 'photo', 2048, 1010, 17),
	(1813662173979123712, '1813662183558942744', 'https://pbs.twimg.com/tweet_video_thumb/GStsI1aWoAAKDmm.jpg', 'photo', 498, 288, 17),
	(1831330212941893632, '1831330220525133826', 'https://pbs.twimg.com/media/GWoxIDjXkAAxL18.jpg', 'photo', 1125, 1016, 24);


--
-- Data for Name: tweet_urls; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tweet_urls" ("id", "url", "expanded_url", "display_url", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(20187, 'https://t.co/2lm05LbeMd', 'https://x.com/exgenesis/status/1821973034066219458?t=qbB-OSRhWe2g-4Fyhb8JWQ&s=19', 'x.com/exgenesis/stat…', '1826039827273511058'),
	(20188, 'https://t.co/pZnbI9ovAh', 'https://x.com/emergentvibe/status/1822651454693187624', 'x.com/emergentvibe/s…', '1826011755287392590'),
	(20189, 'https://t.co/D3x6mftsDV', 'https://soundcloud.com/emergentvibe/technoloop1', 'soundcloud.com/emergentvibe/t…', '1823112945888575933'),
	(20190, 'https://t.co/Q5qNU68kVJ', 'https://emergentvibe.substack.com/p/fighting-perfectionism', 'emergentvibe.substack.com/p/fighting-per…', '1822965501670138132'),
	(20191, 'https://t.co/2gIZCs7woa', 'https://soundcloud.com/emergentvibe/this-is-bad', 'soundcloud.com/emergentvibe/t…', '1822939675499057552'),
	(20192, 'https://t.co/nDDIh7bF5J', 'https://open.spotify.com/track/5F8XPD481L6K2s8h02Vxuo?si=d8220236789042f5', 'open.spotify.com/track/5F8XPD48…', '1822651454693187624'),
	(20193, 'https://t.co/pGAl4K23fZ', 'https://www.youtube.com/watch?v=rLfzO7Sbdc4', 'youtube.com/watch?v=rLfzO7…', '1822392610574455151'),
	(20194, 'https://t.co/5cCJlJYbtY', 'https://twitter.com/exgenesis/status/1822352975471300687', 'twitter.com/exgenesis/stat…', '1822354549870309535'),
	(20195, 'https://t.co/L68lthjULV', 'https://twitter.com/positive_loop/status/1822318325805830183', 'twitter.com/positive_loop/…', '1822330113054126534');



--
-- Data for Name: user_mentions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_mentions" ("id", "mentioned_user_id", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(131735, '1915273423', '1826293049888268345'),
	(131736, '345709253', '1826283256230322499'),
	(131737, '1789313511031463936', '1826265989094511029'),
	(131738, '1223231444429856769', '1826262488335429979'),
	(131739, '185214623', '1826259465991246176'),
	(131740, '185214623', '1826259175044948331'),
	(131741, '1223231444429856769', '1826258946249892248'),
	(131742, '1463167815549079556', '1826258717840748911'),
	(131743, '1163743742764998658', '1826206155733160282'),
	(131744, '1163743742764998658', '1826175139223843048'),
	(131745, '1434637666033807360', '1826167490415673607'),
	(131746, '1101222943013580800', '1826166734157410458');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id") VALUES
	('archives', 'archives', NULL, '2024-08-30 20:41:51.474711+00', '2024-08-30 20:41:51.474711+00', false, false, NULL, NULL, NULL);


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") VALUES
	('6645a8e8-9c1a-4232-a7c1-f421a98672ab', 'archives', '1166420252898603008/euxenus_2024-07-16T21:36:19.000Z.json', '519273d3-fbf0-4191-9c16-7442ea6d1b7b', '2024-09-06 15:12:28.13297+00', '2024-09-06 15:12:28.13297+00', '2024-09-06 15:12:28.13297+00', '{"eTag": "\"ee377444b2ac71f96d5c5c9eccda0b6a-2\"", "size": 8224958, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T15:12:28.000Z", "contentLength": 8224958, "httpStatusCode": 200}', '8f1f2364-c47f-4948-b70e-402b0ed1bd08', '519273d3-fbf0-4191-9c16-7442ea6d1b7b', '{}'),
	('1f6f999f-52e1-42bc-a7f5-cbe420d5eb11', 'archives', '3434231452/bierlingm_2024-08-30T05:42:33.000Z.json', '73bf70cd-806d-4056-bedc-b0c31d9217cb', '2024-09-03 11:50:19.867224+00', '2024-09-03 11:52:10.304802+00', '2024-09-03 11:50:19.867224+00', '{"eTag": "\"32a4397e6ab349730710f262287f8f10-8\"", "size": 38652097, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-03T11:52:09.000Z", "contentLength": 38652097, "httpStatusCode": 200}', 'ff98ef86-19dd-4978-b4a3-5a2b6106d079', '73bf70cd-806d-4056-bedc-b0c31d9217cb', '{}'),
	('e9bcee26-006a-4ebe-a5be-6f2a81c9f233', 'archives', '322603863/exgenesis_2024-08-14T08:14:14.000Z.json', '850fd0fc-7dd1-4b15-89d1-3ab59d09f306', '2024-09-04 07:51:50.095061+00', '2024-09-04 07:51:50.095061+00', '2024-09-04 07:51:50.095061+00', '{"eTag": "\"e80ecb9778ca4124d9a253c550b8215e-7\"", "size": 34512328, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-04T07:51:49.000Z", "contentLength": 34512328, "httpStatusCode": 200}', '5a375099-23c8-4ae6-8164-b8295f8124fc', '850fd0fc-7dd1-4b15-89d1-3ab59d09f306', '{}'),
	('a9a84d8f-f137-4bc3-879c-152d9dd5e902', 'archives', '1796120648281923584/emergentvibe_2024-08-21T16:48:16.000Z.json', '527711f2-a302-4d17-ad38-b7854f7d04fc', '2024-08-30 23:57:09.344961+00', '2024-09-04 07:53:07.086482+00', '2024-08-30 23:57:09.344961+00', '{"eTag": "\"9740f4dfa1deba3fba310577edaffb3e\"", "size": 1449823, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-04T07:53:07.000Z", "contentLength": 1449823, "httpStatusCode": 200}', '52189b36-94ca-42fc-b91c-c9fc0d57c5b5', '527711f2-a302-4d17-ad38-b7854f7d04fc', '{}'),
	('6dfe0e4c-c72d-40f8-8161-2f0c21574560', 'archives', '1133288553859887106/FriedKielbasa_2024-08-27T03:47:21.000Z.json', '1474a65b-68f5-40df-91d2-6de09e5f50a9', '2024-09-04 15:24:28.093808+00', '2024-09-04 15:24:28.093808+00', '2024-09-04 15:24:28.093808+00', '{"eTag": "\"93dcb77275d9235c740e0a0cc581f7d6-5\"", "size": 24840056, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-04T15:24:27.000Z", "contentLength": 24840056, "httpStatusCode": 200}', '1e3b87e8-1fda-4b33-b507-6ca591bed215', '1474a65b-68f5-40df-91d2-6de09e5f50a9', '{}'),
	('53ee9aec-cd64-4eb7-9828-b0f10e7cfed4', 'archives', '2063951/tasshinfogleman_2024-09-05T08:16:00.000Z.json', '625bb12a-b5aa-4593-a23f-f05a27a51d66', '2024-09-05 08:53:03.673636+00', '2024-09-05 08:53:03.673636+00', '2024-09-05 08:53:03.673636+00', '{"eTag": "\"ef3c79a8f0a27d10b37a7fe3c9a34e37-12\"", "size": 59985077, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-05T08:53:02.000Z", "contentLength": 59985077, "httpStatusCode": 200}', '56605f86-b762-4a3c-b603-cf681d13e5c9', '625bb12a-b5aa-4593-a23f-f05a27a51d66', '{}'),
	('b2d5ac48-e492-420f-860d-131c9abe77e6', 'archives', '1223231444429856769/the_wilderless_2024-09-05T06:44:48.000Z.json', '40cd7041-b44b-4449-93c4-49959cb1a36f', '2024-09-05 17:41:47.787355+00', '2024-09-05 17:41:47.787355+00', '2024-09-05 17:41:47.787355+00', '{"eTag": "\"317c87f997aedf883ac753a775395726-17\"", "size": 88468955, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-05T17:41:46.000Z", "contentLength": 88468955, "httpStatusCode": 200}', 'd54d20f6-64a5-458f-98ac-980b1b232d4c', '40cd7041-b44b-4449-93c4-49959cb1a36f', '{}'),
	('73013a4a-d41f-4462-9203-acc83bcd1903', 'archives', '1335851599483133953/nobu_hibiki_2024-08-14T12:23:59.000Z.json', 'd0ee9743-2093-45e1-ab23-812ade1c25ae', '2024-09-05 18:00:30.516611+00', '2024-09-05 18:00:30.516611+00', '2024-09-05 18:00:30.516611+00', '{"eTag": "\"077666b5d8761f2a9c895d5f398c8e61-30\"", "size": 156000865, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-05T18:00:16.000Z", "contentLength": 156000865, "httpStatusCode": 200}', '754885ca-8aa8-42e9-9a63-81ef649d04bc', 'd0ee9743-2093-45e1-ab23-812ade1c25ae', '{}'),
	('5930267b-b864-45a5-a73a-085b4fae78c9', 'archives', '1635244909983662081/dpinkshadow_2024-08-25T13:19:24.000Z.json', '6caed2d8-8034-43e7-bd50-078671ff131f', '2024-09-06 10:30:10.327898+00', '2024-09-06 10:30:10.327898+00', '2024-09-06 10:30:10.327898+00', '{"eTag": "\"248d04443b82d14563dbba605c290e05-2\"", "size": 8443801, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T10:30:10.000Z", "contentLength": 8443801, "httpStatusCode": 200}', '2ded62f9-6b38-43df-b776-22d7ae22b6b1', '6caed2d8-8034-43e7-bd50-078671ff131f', '{}'),
	('bfe9c4fb-7c85-4952-b424-b1e6dee84a0c', 'archives', '1260820328617578501/moissanist_2024-08-20T12:11:50.000Z.json', '7ff29162-e020-4cb3-a08a-2fa21b7e705e', '2024-09-06 18:12:03.311754+00', '2024-09-06 18:12:03.311754+00', '2024-09-06 18:12:03.311754+00', '{"eTag": "\"b52f57333c03050260c36b2add31425e-2\"", "size": 7700183, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T18:12:03.000Z", "contentLength": 7700183, "httpStatusCode": 200}', '5666f2eb-e8c2-4735-898c-238f44d173c1', '7ff29162-e020-4cb3-a08a-2fa21b7e705e', '{}'),
	('65b6dc13-a844-4149-88c5-c8212e5b79cb', 'archives', '973083181640335360/br___ian_2024-08-14T05:13:38.000Z.json', '8e91dbcc-2bf7-4b5f-a7c0-555a406037c6', '2024-09-06 18:12:11.441308+00', '2024-09-06 18:12:11.441308+00', '2024-09-06 18:12:11.441308+00', '{"eTag": "\"add0504a985d49be4eb0069150adf522-11\"", "size": 54912013, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T18:12:10.000Z", "contentLength": 54912013, "httpStatusCode": 200}', '04208089-efdf-4166-8ebd-23488dd4f6bb', '8e91dbcc-2bf7-4b5f-a7c0-555a406037c6', '{}'),
	('a959c4f4-05f6-4dc6-9cd1-6c1afe580664', 'archives', '322603863/exGenesis_2023-02-18T19:45:15.000Z.json', '7c5a3372-5983-4225-b64d-31593214c995', '2024-09-05 17:14:55.389782+00', '2024-09-07 15:05:33.995844+00', '2024-09-05 17:14:55.389782+00', '{"eTag": "\"3f859612e9e71a87b67be9174e94e40a\"", "size": 15371, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-07T15:05:34.000Z", "contentLength": 15371, "httpStatusCode": 200}', '65f53fa7-a387-4c01-8b8e-28ea88b6ef90', '7c5a3372-5983-4225-b64d-31593214c995', '{}'),
	('4b93eb48-efe0-4443-8a47-8c7c05fb7d02', 'archives', '359242457/AlexKrusz_2024-09-06T01:26:53.000Z.json', 'd7e5c54e-e1b2-4503-ba90-fa0d64216079', '2024-09-06 18:29:09.330385+00', '2024-09-06 18:29:09.330385+00', '2024-09-06 18:29:09.330385+00', '{"eTag": "\"3be1ff5ea09606e6bd82323c4e619006-3\"", "size": 15323040, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T18:29:09.000Z", "contentLength": 15323040, "httpStatusCode": 200}', '50f99717-0ea2-443f-aae7-b2eda9bc352e', 'd7e5c54e-e1b2-4503-ba90-fa0d64216079', '{}'),
	('5751e5a0-c9fb-4dce-901e-e307076bc123', 'archives', '1456268838970945536/nido_kween_2024-09-04T14:26:16.000Z.json', 'af0b34e3-b680-4b15-b869-04497e320f16', '2024-09-06 18:58:12.941605+00', '2024-09-06 18:58:12.941605+00', '2024-09-06 18:58:12.941605+00', '{"eTag": "\"b029e9c266d26cac3962a66663b9a0d0-3\"", "size": 12533065, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T18:58:13.000Z", "contentLength": 12533065, "httpStatusCode": 200}', '5883e9ac-a702-423a-8a1f-1aa2f553c4bd', 'af0b34e3-b680-4b15-b869-04497e320f16', '{}'),
	('9bc70135-f06b-4a93-aca8-e2de28bc44c2', 'archives', '1915273423/loopholekid_2024-09-06T17:40:30.000Z.json', '82dc8135-4efa-4d51-a3d9-ea00013bd070', '2024-09-06 21:18:55.370164+00', '2024-09-06 21:18:55.370164+00', '2024-09-06 21:18:55.370164+00', '{"eTag": "\"76ec2b06f395ae9e9910dc74e2bd19ae-11\"", "size": 55353331, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T21:18:54.000Z", "contentLength": 55353331, "httpStatusCode": 200}', '94ac0967-d32a-4880-b0e8-cf6547cf669a', '82dc8135-4efa-4d51-a3d9-ea00013bd070', '{}'),
	('0757096d-8dde-410b-816d-5defeeb632e9', 'archives', '18280363/TylerAlterman_2024-08-20T16:16:18.000Z.json', '0c2e3edc-11cd-4046-8a2f-53deb9bfc34b', '2024-09-06 22:41:02.460113+00', '2024-09-06 22:41:02.460113+00', '2024-09-06 22:41:02.460113+00', '{"eTag": "\"be925c8da2ce4f11b8a1729cda884d7d-8\"", "size": 39891607, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-06T22:41:01.000Z", "contentLength": 39891607, "httpStatusCode": 200}', 'e356aff0-fe3c-48ea-a0d9-083031a7a464', '0c2e3edc-11cd-4046-8a2f-53deb9bfc34b', '{}'),
	('3f1435c2-6464-40fc-bfad-b863c92214eb', 'archives', '19607314/rickbenger_2024-09-06T09:12:50.000Z.json', '5d12e6f8-7f28-4707-97af-97fe7d536411', '2024-09-07 12:09:19.697662+00', '2024-09-07 12:09:19.697662+00', '2024-09-07 12:09:19.697662+00', '{"eTag": "\"e641ac785e45c77b58ac86bfb4e2dfd5-3\"", "size": 12987206, "mimetype": "text/plain;charset=UTF-8", "cacheControl": "max-age=3600", "lastModified": "2024-09-07T12:09:19.000Z", "contentLength": 12987206, "httpStatusCode": 200}', 'ef8c7bb6-bdce-4982-b9b4-3beb7ed1a62d', '5d12e6f8-7f28-4707-97af-97fe7d536411', '{}');


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 182, true);


--
-- Name: archive_upload_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."archive_upload_id_seq"', 8, true);


--
-- Name: followers_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."followers_id_seq"', 3314, true);


--
-- Name: following_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."following_id_seq"', 1435, true);


--
-- Name: likes_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."likes_id_seq"', 156247, true);


--
-- Name: profile_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."profile_id_seq"', 8, true);


--
-- Name: tweet_urls_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."tweet_urls_id_seq"', 3402, true);


--
-- Name: user_mentions_id_seq; Type: SEQUENCE SET; Schema: dev; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."user_mentions_id_seq"', 23275, true);


--
-- Name: key_key_id_seq; Type: SEQUENCE SET; Schema: pgsodium; Owner: supabase_admin
--

SELECT pg_catalog.setval('"pgsodium"."key_key_id_seq"', 1, false);


--
-- Name: archive_upload_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."archive_upload_id_seq"', 41, true);


--
-- Name: followers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."followers_id_seq"', 82721, true);


--
-- Name: following_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."following_id_seq"', 22302, true);


--
-- Name: likes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."likes_id_seq"', 2074866, true);


--
-- Name: profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."profile_id_seq"', 145, true);


--
-- Name: tweet_urls_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."tweet_urls_id_seq"', 60349, true);


--
-- Name: user_mentions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."user_mentions_id_seq"', 378797, true);


--
-- PostgreSQL database dump complete
--

RESET ALL;
