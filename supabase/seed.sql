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
	(2, '322603863', '1310630474755178496', 8),
	(3, '322603863', '1265789414023651328', 8),
	(1, '322603863', '1252851', 1),
	(22, '322603863', '1686843568214732800', 8),
	(23, '322603863', '1325102346792218629', 8),
	(24, '322603863', '1589698328920481793', 8),
	(25, '322603863', '1502894259409620992', 8),
	(26, '322603863', '1266440523226595328', 8),
	(27, '322603863', '1817440598699503617', 8),
	(28, '322603863', '18915567', 8),
	(29, '322603863', '1351153127215525891', 8),
	(30, '322603863', '1279085305585299456', 8),
	(31, '322603863', '1728780830837784576', 8),
	(32, '322603863', '11280212', 8),
	(33, '322603863', '1165044870362189824', 8),
	(34, '322603863', '899920395884613632', 8),
	(35, '322603863', '2564032273', 8),
	(36, '322603863', '122651572', 8),
	(37, '322603863', '68646706', 8),
	(38, '322603863', '374160268', 8),
	(39, '322603863', '234759011', 8),
	(40, '322603863', '171461969', 8),
	(41, '322603863', '1947353262', 8),
	(42, '322603863', '2525996200', 8),
	(43, '322603863', '1571958020380164105', 8),
	(44, '322603863', '1817410908856991744', 8),
	(45, '322603863', '1016733664393289731', 8),
	(46, '322603863', '1357843337873530881', 8),
	(47, '322603863', '887401434261618689', 8);


--
-- Data for Name: following; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."following" ("id", "account_id", "following_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '322603863', '824308056351735809', 8),
	(2, '322603863', '18969923', 8),
	(3, '322603863', '3297675443', 8),
	(22, '322603863', '450679540', 8),
	(23, '322603863', '36223287', 8),
	(24, '322603863', '1712551744985772034', 8),
	(25, '322603863', '116624142', 8),
	(26, '322603863', '897198731975680001', 8),
	(27, '322603863', '953887377017065472', 8),
	(28, '322603863', '1279085305585299456', 8),
	(29, '322603863', '1165044870362189824', 8),
	(30, '322603863', '440506882', 8),
	(31, '322603863', '258669040', 8),
	(32, '322603863', '1789313511031463936', 8),
	(33, '322603863', '626009716', 8),
	(34, '322603863', '1578635642', 8),
	(35, '322603863', '1947353262', 8),
	(36, '322603863', '628565963', 8),
	(37, '322603863', '21125274', 8),
	(38, '322603863', '7403862', 8),
	(39, '322603863', '341075360', 8),
	(40, '322603863', '781251776', 8),
	(41, '322603863', '140145169', 8),
	(42, '322603863', '1378756086585434112', 8),
	(43, '322603863', '1595503608514023425', 8),
	(44, '322603863', '1270449309402759171', 8),
	(45, '322603863', '1543828822298046465', 8),
	(46, '322603863', '1101222943013580800', 8),
	(47, '322603863', '15664679', 8),
	(48, '322603863', '366913586', 8),
	(49, '322603863', '1646556562154979349', 8),
	(50, '322603863', '16645904', 8),
	(51, '322603863', '1201929047376367616', 8),
	(52, '322603863', '1772318878934118400', 8),
	(53, '322603863', '1680757426889342977', 8),
	(54, '322603863', '728643243143880704', 8),
	(55, '322603863', '1760612649526501377', 8),
	(56, '322603863', '419062662', 8),
	(57, '322603863', '1730335465398730752', 8),
	(58, '322603863', '1806051955489304576', 8),
	(59, '322603863', '1271253394343288833', 8),
	(60, '322603863', '2548140547', 8),
	(61, '322603863', '1571214400060522497', 8),
	(62, '322603863', '460912809', 8),
	(63, '322603863', '3995508550', 8),
	(64, '322603863', '311497922', 8),
	(65, '322603863', '2533800542', 8),
	(66, '322603863', '192201556', 8),
	(67, '322603863', '966254130904948736', 8),
	(68, '322603863', '3366261526', 8),
	(69, '322603863', '926984278579216384', 8),
	(70, '322603863', '1504221988814049289', 8),
	(71, '322603863', '146358342', 8),
	(72, '322603863', '1792843683655454721', 8),
	(73, '322603863', '532970397', 8),
	(74, '322603863', '1387459794399760385', 8),
	(75, '322603863', '917512572965761024', 8),
	(76, '322603863', '1260577292067254276', 8),
	(77, '322603863', '3068493833', 8),
	(78, '322603863', '4881437273', 8),
	(79, '322603863', '1791107953304510464', 8),
	(80, '322603863', '1605052364154609671', 8),
	(81, '322603863', '3125968288', 8),
	(82, '322603863', '1360542136584859649', 8),
	(83, '322603863', '1747709313920188416', 8),
	(84, '322603863', '18460574', 8),
	(85, '322603863', '18603224', 8),
	(86, '322603863', '209549512', 8),
	(87, '322603863', '259851344', 8),
	(88, '322603863', '1522762129', 8),
	(89, '322603863', '3108782746', 8),
	(90, '322603863', '1152313771307786241', 8),
	(91, '322603863', '1785448727051894784', 8),
	(92, '322603863', '3742851378', 8),
	(93, '322603863', '1802854238370050050', 8),
	(94, '322603863', '1749997708599783424', 8),
	(95, '322603863', '1260820328617578501', 8),
	(96, '322603863', '2993757996', 8),
	(97, '322603863', '1570551125509836800', 8),
	(98, '322603863', '1796120648281923584', 8),
	(99, '322603863', '1677449576427520003', 8),
	(100, '322603863', '1393963303773351936', 8),
	(101, '322603863', '77502415', 8),
	(102, '322603863', '1734464675788800000', 8),
	(103, '322603863', '1510642256214175746', 8),
	(104, '322603863', '1777054704511422464', 8),
	(105, '322603863', '704559922143322112', 8),
	(106, '322603863', '1276310243123720192', 8),
	(107, '322603863', '1681538907987656704', 8),
	(108, '322603863', '433112513', 8),
	(109, '322603863', '1425881586621304833', 8),
	(110, '322603863', '69562696', 8),
	(111, '322603863', '37883116', 8),
	(112, '322603863', '1396544008508354561', 8),
	(113, '322603863', '14560214', 8),
	(114, '322603863', '935944407584526336', 8),
	(115, '322603863', '1285404770887512074', 8),
	(116, '322603863', '4683326078', 8),
	(117, '322603863', '1762205551935791104', 8),
	(118, '322603863', '1045863025373315072', 8),
	(119, '322603863', '1033457034308608006', 8),
	(120, '322603863', '3007363086', 8),
	(121, '322603863', '1328939221785174017', 8),
	(122, '322603863', '1127980174455083008', 8),
	(123, '322603863', '40541641', 8),
	(124, '322603863', '7489042', 8),
	(125, '322603863', '1170701109629018117', 8),
	(126, '322603863', '1193288515678883841', 8),
	(127, '322603863', '1330876190064848901', 8),
	(128, '322603863', '1333576890599301128', 8),
	(129, '322603863', '2610283027', 8),
	(130, '322603863', '53987352', 8),
	(131, '322603863', '2235095173', 8),
	(132, '322603863', '1628754961', 8),
	(133, '322603863', '345348803', 8);


--
-- Data for Name: liked_tweets; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."liked_tweets" ("tweet_id", "full_text") VALUES
	('1627038980352147458', 'They''re so flat they''re almost completely clear, except when the light catches them just right. You can read more in an article I wrote about them here: https://t.co/BhS444jEkF https://t.co/iFeHiZZdUn'),
	('1627038691825950720', 'Sea sapphires are some of the most beautiful animals on Earth.
Their bodies contain microscopic crystals that reflect blue light. They use this shine in courtship displays, &amp; in Japan, fishers call this tama-mizu: jeweled water.
📽️ https://t.co/NI2DioTKA4
https://t.co/Koww4X3sXB'),
	('1627039445253001219', 'https://t.co/erVoNQELZ2'),
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

https://t.co/ZkZN2itR7L'),
	('1726634542210126197', 'This Post is from a suspended account. {learnmore}'),
	('1812889457739309235', '@exgenesis Where is it?'),
	('1823552276264550545', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin @AbstractFairy yeah i think there''s something here but it extends all the way to hivemind infrastructure and i''m not sure the right starting conditions'),
	('1823549800035582254', '@_deepfates @exgenesis @_brentbaum @Tangrenin @AbstractFairy @exgenesis had this brilliant idea of it being open only to people you trust, not open by default (like I really mainly want the archives of people I interact with a lot or potential collaborators etc to find points of contact between our work)'),
	('1822734675703628079', '@LouisVArge last night a DJ made feel pleasure several orders of magnitude above the norm'),
	('1726155265647739182', 'what a time to be alive https://t.co/DDw8gVPS7M'),
	('1823549593466102132', '@_deepfates @exgenesis @_brentbaum @Tangrenin @AbstractFairy Yeah I think that is a great direction too. I wasn''t sure how many people wanted to upload their thing publicly. I wanted (1) to have tools to explore my archive (2) contribute viz tools and share it with others (so tools can be open even if data isn''t)'),
	('1823549201239953531', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin @AbstractFairy the thing i''m working on is local first partly for this reason. i think i have a different goal than just "hosting interlinked archive" though, I am trying to curate and reflect upon my own archive more. There is something like interlinked archive on github let me find it'),
	('1823548596274520551', '@_deepfates @exgenesis @_brentbaum @Tangrenin Yeah @AbstractFairy was saying it''d be nice to also have the images retained!! I don''t know how much storage costs on like S3/cloudflare, or there''s others scalable solutions here that don''t rely on one person/entity holding everyone''s data'),
	('1823547532682920007', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin okay nice haha i appreciate that. most of the size is images and videos, it''s true. but as a creator of images and videos i value those too 😅'),
	('1823547213890408516', '@_deepfates @exgenesis @_brentbaum @Tangrenin initial version actually had it so you have to upload the individual files, tweets.json, followers.json etc but it was annoying while testing 

but would be nice to have that be the actual workflow yeah'),
	('1823546870322340041', '@_deepfates @exgenesis @_brentbaum @Tangrenin yes! i strip out the DM''s and email locally before uploading. i think most of the size is images/videos? 

https://t.co/PJV6rrEVbp https://t.co/fte84g1U6H'),
	('1823545056130949547', '@DefenderOfBasic @exgenesis @_brentbaum @Tangrenin Wait you''re just having people upload the whole zip? i feel like this should have huge disclaimers on it like ALL YOUR DIRECT MESSAGES AND GROUP CHATS ARE IN THIS FILE. also mine is 7.8GB lol'),
	('1820551525305127342', '@cxgonzalez @Meaningness Right, people tend to be as they have been. But much more radical discontinuity is possible than we tend to imagine, and part of what prevents it is essentialism about selves (one’s own and others’).

Example: you find yourself beginning to fall into a familiar fight with your…'),
	('1820632011331272930', 'how to be more agentic https://t.co/se0asgV4ug'),
	('1823497968093421978', 'calling other people NPCs is such a dead giveaway for narcissism/sociopathy'),
	('1823499779248414828', 'huge insight from @JoeHudson: 

*obligation cuts off love*

(on an experiential level i.e. the FEELING of obligation makes the FEELING of love impossible at the same time)

makes me think of an exercise of reframing SHOULDs into WANTs at uni

(that i only now see the wisdom of)'),
	('1823483488521310509', '@TylerAlterman I’m doing this, but still very early stages.'),
	('1823485220622152111', '@TylerAlterman My thought would be more like DC and courting young policy and politics aspirants disillusioned with the game there'),
	('1823490713784606835', '@TylerAlterman @thesfcommons seems full of people thinking this way, especially @patriciamou_'),
	('1823469799588159651', 'Where do I find "community entreprenuers" and institution-creators – ie civilization-builders?

Seems like all the entrepreneurship talent rn is going into tech – which is still cool. But do I visit communities of tech entrepreneurs and persuade a few to take alternate paths?'),
	('1823412701441482959', 'Announcing our latest research breakthrough: 

Agent Q - bringing next-generation AI agents with planning and AI self-healing capabilities, with a 340% improvement over LLama 3''s baseline zero-shot performance! https://t.co/EdypdDn26M'),
	('1823467317520695461', 'The most important thing to come out of the recent AI wave is that the concept of inference has mostly subsumed induction and deduction.'),
	('1823457887206961380', 'This is a very good question and the answer depends entirely on how you conceptualize the work that you do.
Are you gathering wood, or yearning for a vast and endless sea?
There are cathedrals-in-progress everywhere, for those with eyes to see. https://t.co/ClWyQZm22v https://t.co/HtFDBLbMAU'),
	('1821945489756959017', 'A country like India with internal security challenges in parts could virtually eliminate ambushes and infiltrations with an aggressive drone adoption program.'),
	('1822791699858678063', 'Do you remember the slaughterbots video that Stuart Russell presented in 2017? It''s rapidly becoming reality https://t.co/sFzVF1FvIF'),
	('1822816013622407483', 'Hey what if I actually started paying attention to and internalizing the compliments people who know me well pay me, as a bit'),
	('1822837352919978041', 'about 20 years ago there was a vocal subset of men who made it a point of pride to min-max hooking up with attractive women with the explicit intent of not wanting marriage. this cascaded out into mainstream culture, then I think it was driven into the shadows during MeToo https://t.co/frL5q5QK6o'),
	('1822293183235076115', 'the subconscious mind yearns for WebSim https://t.co/1aHc62H6vN'),
	('1822897493773828281', '@positive_loop would you write a little thread about what it is like to get accurate appreciations from peers?'),
	('1822011771902664787', 'attune yourself to the holy matrix 

https://t.co/ZfqCZBEejF https://t.co/uXtmQVjM2c'),
	('1822874637694636331', '"moral intuitions are generally symmetry intuitions, so fixing asymmetries in your direct phenomenology should allow much clearer direct perception of things likely to be perceived as moral/immoral"
— @RomeoStevens76'),
	('1822795200252821882', 'Ticket sales for Cascade Camp finished. 29 attending along with the seven coordinators and a handful of residents. 

I''m excited to get together with you all. One final email going out early this week with location details and things to know about this weekend.'),
	('1822698627200094689', 'in a craniosacral session I realized that, especially growing up, I felt the need to prepare some self to interface with others, but my self is more of an undulating mountain stream than a fixed point

I realized I don’t need to prepare any self—I can just let the self that is in…'),
	('1822639227097469121', '@SpencrGreenberg Not quite the same but: https://t.co/HI3s81iKkg'),
	('1726638813559369947', 'the mere undeniable reality of conscious experience is a fundamental miracle'),
	('1822637652597719214', 'I think a lot of people would benefit from developing a set of their own life principles. Here are mine. Of course, I don''t always live up to them perfectly, but they are useful decision-making guides that I aspire to. I link below to our free tool for mapping your principles. https://t.co/BrZVaAhwyU'),
	('1822673927702802439', 'Thread of photos and videos featuring humans to help the eye determine the size of things.

1. Dendrocalamus Giganteus also known as Dragon Bamboo, is a species of giant bamboo that is indigenous to Southeast Asia https://t.co/QPK5vqz1Fp'),
	('1822799964902445298', 'If I''m writing an essay, and don''t want to write out "the coalition of Rationalists and Effective Altruists trying to shut down AI research for fear of unaligned AGI" two dozen times, is there a better term than "Doomers" which is descriptive, widely understood, and short?'),
	('1822732087180284128', '@LouisVArge idk if i believe in log valence but U make a compelling argument 😎'),
	('1822730300507435195', 'if you believe in log valence, DJ should be #1 effective altruist career

no i will not elaborate further'),
	('1822861505106157575', 'Honestly it feels like this https://t.co/bhNx2kmmz8 https://t.co/nyGa91nUJm'),
	('1822500071880950223', 'Slightly obsessed with the bit about "the loss of the familiar". Brilliant encapsulation of the surprisingly common notion that people have a legal right to be protected from witnessing change which supersedes all other rights. https://t.co/ews77YvCGo'),
	('1822921824340177046', '"This function" = self soothing, having a positive internal representation of love to soothe one during difficult times. https://t.co/Ujczec7uu4 https://t.co/XTiOTRVD3u'),
	('1822923003165921294', '@eatnik 😭'),
	('1822922842582995068', '@rikardhjort You''re doing so well'),
	('1822922448997945422', '@rikardhjort Good boy'),
	('1822922711888232779', '@tasshinfogleman unironically "encourage me like you would encourage a dog" is great advice on how to delight me'),
	('1822754939715915916', 'Can I show you a video that cured me of every bad feeling just now https://t.co/xZMePCnhso'),
	('1813173433217253794', 'reading this tweet gave shape to my personal myth. 

“you have more fragments of society’s computation in your body. you are responsible for [have the calling to bring] their integration” https://t.co/aB0k5q7Ut2'),
	('1812930809759953058', 'the models trying to learn https://t.co/tK0NurGje8 https://t.co/EwGSFJFb2V'),
	('1812926436623413285', 'There are crystal structures that simply won''t form anymore, even though they did a few decades ago. Real life Ice-9? Could make an incredible sci-fi book.
https://t.co/plVu56KejX'),
	('1813157457151336472', 'Microscopic crystal seeds accumulate in the environment, constraining what crystal structures can aggregate around them and which ones cannot, driving an evolution in the crystal kingdom. Do the seeds of minds saturating our environment constrain the psyches that can form today? https://t.co/do6qFKTYjv'),
	('1812856086459826298', 'i’m additionally interested in ops roles at bio/neurotech companies/startups. i decided to step down from hands-on bio research but i would still love to be in the midst of it happening and operate at the ideas- and people-level

i’m also very interested in the future of learning…'),
	('1812856084643660191', 'my professional background is in biology: biochemistry major, doctorate in developmental neuroscience. my current research interests lie in science history and sociology &amp; economics of science'),
	('1812856083381109042', 'i’m in the job market, with an availability starting march-april 2025, and i’m looking for research or ops positions in

metascience
science history &amp; sociology of science
bio/neurotech
edtech

would appreciate any leads to job openings along these lines!'),
	('1812926226807292036', 'Hallo my friends! 

TREEWEEK tickets are live!!!

From this time ~30 room tickets, 20 camping tickets. First come first serve :)

Can''t wait to welcome you to a lush space with all 4 elements: 🌊 lake, 🌳 trees, 🔥 sauna, 🌬️ friends.

L I  N K  I N   B I  O

also, AMA about it! https://t.co/h9q2qrjoGA'),
	('1812672294973829360', 'Didn’t suffer any more from allergies that day (also haven’t had any allergies since)'),
	('1812671574845403391', 'I was having some allergies and squirming around v uncomfortable. I asked the discomfort, “Why?” It responded: “Because then mom will come and help.” But she wasn’t around. In that moment, I entirely stopped suffering (it was still painful, just not bad). What?'),
	('1812944156748357636', 'treeweek is selling out! do not delay! https://t.co/sQf9xRoSsQ'),
	('1813024511572517159', 'You’re unable to view this Post because this account owner limits who can view their Posts. {learnmore}'),
	('1813017350423110129', 'You’re unable to view this Post because this account owner limits who can view their Posts. {learnmore}'),
	('1813117102355784013', 'I don''t know why we have so many full length books on jhana https://t.co/TcOMtAXpu9'),
	('1812943772717883452', 'Who wants to join the writing / blogging / accidentally deleting the whole site team?? You will be able to log in, and make posts. Either of your own stuff or of a collection of cool stuff you saw with back links. Reply or DM 😎 https://t.co/av45TTj7VW'),
	('1813127059079897461', '@zencephalon @exgenesis @becomingbabyman @s0ulDirect0r maybe, because everyone is a unique person, everyone ought to have their own customized notetaking/PKM software

maybe, something like foobar2k but for notetaking?'),
	('1813086048693723400', '@exgenesis FOMO FOMO FOMO FOMO 😢 💔 😞 😫'),
	('1813036726836719647', '@exgenesis Started reading Song of Significance on the back of this.  Having a hard time putting it down.  Thanks for the recs. =p'),
	('1813018489638253043', '@coladaclan @exgenesis love your work. let''s do it'),
	('1813003006457082254', 'Bryan Johnson is advanced bro science (good)'),
	('1813003773473694165', 'PAUL FOR PRESIDENT PLS! 😆 https://t.co/DAzGcOIIQP'),
	('1812949107969040784', 'happy for X, sad to see one of the greatest minds of my era pointed at increasing user-seconds as a metric of success https://t.co/cPYCm5xBY3'),
	('1813002567447687412', '@exgenesis beautiful'),
	('1812928707016757706', 'People coming to TREEWEEK so far: 

@not_a_hot_girl
@positive_loop
@yoltartar
@christineist 
@Hikarinessa 
@dismaien 
@puheenix 
@jnsyaaa 
@sol1dude
@LaurenUba 
@ames_for_joy 
@UntilTrees 
@RandomR67879871 
@mechanical_monk 
@Emanorick'),
	('1812991506451722533', '@emergentvibe @exgenesis Emergent, I love your marks. Want to noodle on a piece together? (Shoving my ig here for a flavour of my work) https://t.co/sfmwx95yA5'),
	('1726630455078953322', '(my idea was that brooke could take over an empty off-season ski town instead of building her own city)'),
	('1726640279795720683', 'if you''re wondering how i stayed consistent over tech bro armageddon 

sudo vim /etc/hosts https://t.co/5R1q8a4AGy'),
	('1726641901544370513', 'https://t.co/d7NLUd6TH7 https://t.co/CvUkTt8P6d'),
	('1726292016995442846', 'Some of you reading this haven''t read Theft of Fire yet. 

It''s okay, I understand. My wife made shilling into a meme, a lot of people went with the joke, but not everyone wants to cough up ten bucks just because someone on the internet was funny. 

But you can''t meme this. https://t.co/rnFfifGebc'),
	('1726555832736006342', 'oh my god https://t.co/u07vTBDvp5 https://t.co/a5EcUDK8sb'),
	('1726370977188388971', 'evangelion predicted all of this'),
	('1726271866506002477', 'gm I am happy that you exist https://t.co/nI4WFcZx4k'),
	('1725983229436408046', 'They don''t want you to know carbon capture is this easy https://t.co/MZPYUrmgTY'),
	('1726634219097719184', '@Jeanvaljean689 tpot is something that we all aspire to, it''s over yonder, it''s a way of seeing the world, a horizon, a quest... a certain wavelength of communication that partially and frustratingly shivers with resonant potential and Woodstock feedback governed by alien divinities'),
	('1726632544056295927', '@Jeanvaljean689 maybe there is something a bit sketchy about the ontology of "TPOT" like it''s not an entity or association or group or clique but more like a certain mode of relation or something like postrationalism was a decent meme because it has some dialectic intentionality or something'),
	('1726631894610288696', '@Jeanvaljean689 it''s all kind of building up into a real spiritual warfare kind of vibe with different teams of titanic mission duking it out in the battle for the lightcone'),
	('1726630377555685770', 'I think I''d be more surprised if TPOT people DIDN''T show up more + more in positions of tech leadership

Like srsly,

did you guys not notice that the perennial concerns of TPOT the whole of (gestures widely at the intersection of knowing things + building things)

Are the same?'),
	('1726635168847503498', '@Jeanvaljean689 tpot is what shivers in the world when the supernova of hyperintelligence gets tangled up in the laundry machine cuz we ran it in the same load with the ketamine-stained San Narciso polo shirts and the stubborn legacies of British imperialist empiricism'),
	('1726635888787214629', 'Next time somebody asks what TPOT is, refer them to this tweet https://t.co/rKtidU8Xxh'),
	('1726621280974364729', 'you have no idea how much i think about this https://t.co/EkyoLPusNj'),
	('1726634341328093419', 'This Post is from a suspended account. {learnmore}'),
	('1723477949478023457', 'Trying a new way of engaging with Twitter. Leave a question below, and I''ll come back and answer the most-liked ones (or the ones I like best) later.'),
	('1723480243875578347', 'This Post is from a suspended account. {learnmore}'),
	('1726624197739246042', '@the_wilderless so wait emmett’s my lineage holder in Stormlight? fucking wild hahaha'),
	('1726623745077625201', 'i''m now in the weird position where the CEO of OpenAI mailed me the entirety of the Stormlight Archive

which feels like the simulation is fucking w me somehow'),
	('1726634650314133969', '@dkazand Loool'),
	('1726620098356822215', 'twitter is just an app for microdosing SF https://t.co/9p3VrON9x4'),
	('1726607162846453989', 'It''s Eliezer Yudkowsky''s world now, we''re just living in it...'),
	('1726602977526608160', '&gt;breaking news 
&gt;505 OpenAI DAWGS join Microsoft to work on Minecraft https://t.co/ov7GIpjUTU'),
	('1726609993687064906', 'I actually think ability to pull this off is the linchpin on whether TPOT booms or withers https://t.co/8bPrVidyWb'),
	('1726598393139720594', 'You’re unable to view this Post because this account owner limits who can view their Posts. {learnmore}'),
	('1726611972882669899', 'my mind, constantly https://t.co/qIMtb4rY7R'),
	('1726593419408179540', 'Wow. Does this mean the whole thing gets reversed, like a fire drill where everyone marches back into the building?

Suppose it’s theoretically possible as only ~72 hours of breakage has happened.

Would need to learn if other board members also agree. https://t.co/ig6z7wVin2'),
	('1726600151027073374', '500+ OpenAI employees will quit and join Microsoft unless the board resigns and reinstates Sam and Greg. https://t.co/4LA2EJnHWG https://t.co/XH0DIdR8Bv'),
	('1726603786112901543', 'I don''t see why meditators - who enjoy talking about the practicalities of meditation - don''t talk about the benefits of having a big booty'),
	('1726594398098780570', '❤️❤️❤️ https://t.co/NL3nqrjKUo'),
	('1726604136861643043', 'So if I understand this correctly then tpot is now the CEO of OpenAI? cool cool'),
	('1726588283252281852', 'Had a great "Money Mapping" session with @daemonhugger where I had an opportunity to dig into detail about my various emotional and subconscious beliefs about money. https://t.co/rYRJMsewgx'),
	('1726587485738897822', 'i did not know shrimp could teleport. lookin like an anime fight https://t.co/1bE2zDmObW'),
	('1726531733527593414', 'tfw the new CEO of OpenAI follows me on Twitter'),
	('1726582811623366795', 'Just deleted by roon (paraphrasing): "It would be a nice history if it was some safety vs product schism but unfortunately the reality is much stupider than that"'),
	('1726581708114575504', 'feels like people pretty much want there to be an authoritarian government, and existing institutions are fantasised as more powerful and despotic than they are, because it gives hope in that at least there is a single entity to overthrow https://t.co/4ovwot8D7I'),
	('1726452354671845594', 'https://t.co/HYxYIa3Vep'),
	('1726452051297914936', 'https://t.co/iPX4ktRd0u'),
	('1726451811446607899', '‘a prayer for a child’ https://t.co/vePzEDXejP'),
	('1726450280202715490', 'its hard to find great images of them online. his official gallery published them in a book and i guess keeps them close. you may notice the copyright ‘c’ on some of these images, or that they’re not super large.

nocturnal vibe. https://t.co/0j8Evi8IDd'),
	('1726450549602783389', 'theres a musical form called a nocturne, perhaps made most famous by chopin. literally ‘night music’. i think of some art as nocturnes: https://t.co/L1Ufv4GiSD'),
	('1726450661284561123', 'https://t.co/wtsPsQysR7'),
	('1726449775728599193', 'been posting atypically as ive been clocking insane hours on this project.

this means i’ve been walking my dog late at night. this atmosphere got me thinking about dr. seuss’s ‘midnight paintings’, sometimes called the secret images.

lets look at a few of my favorites here: https://t.co/AifyQN5u1y'),
	('1726575069894189081', 'Reality, by Peter Kingsley, and Existence, by David Hinton, are both absolutely wonderful books, and complete spiritual twins

both books take you on a journey through the history and practice of a deep contemplative tradition,

through detailed attention to a piece of art, its… https://t.co/BswZ1pT7Rd'),
	('1726526112019382275', 'Today I got a call inviting me to consider a once-in-a-lifetime opportunity: to become the interim CEO of @OpenAI. After consulting with my family and reflecting on it for just a few hours, I accepted. I had recently resigned from my role as CEO of Twitch due to the birth of my…'),
	('1726527469002592653', 'Main takeaway, https://t.co/WvrqYEtSGh https://t.co/VsnSedmc5w'),
	('1726404293840785853', 'Finally a shirt that fits my personality: intellectually kiki, emotionally bouba time :-) https://t.co/NhRtTEXyhe'),
	('1726539041179598856', 'https://t.co/23S9rmWvbR https://t.co/BwVUu9XTfn'),
	('1726535037091508704', 'Yes
YES
This is the vision https://t.co/8bPrVidyWb'),
	('1726264802085855526', '“There is a path to end all sufferi—”

Yeah siddhartha we know, it’s called an MDMA Threesome, what the hell have your been doing in the woods this whole time, your wife’s been worried sick'),
	('1677388884852744199', '@dismaien magic?'),
	('1726366208432414882', 'i think this is the single most life-changing post ive ever made- at least my life.

i can confidently say id be different person if i hadnt posted this. the people i met as a result, the city i moved to because i met them, the experiences ive had... its trippy to think about https://t.co/6Wv27jAuAP'),
	('1721904504130641965', '@the_wilderless I feel like there''s low hanging fruit here, for someone who wants to launch a global network of tea houses, for TPOT people

your potential clientele is already primed to show up and drink T from the POT, and vibe with each other.'),
	('1726480053004054692', 'EMMETT SHEAR IS THE OPENAI CEO!? IM MUTUALS WITH THE OPEN AI CEO????????'),
	('1726508156304637987', 'if you think twitter is exciting rn you should probably consider moving to sf'),
	('1726482351340061076', 'Alright but Emmett''s a homie 

Speculate all you like about fit etc but if you resort to insults we gon have a problem'),
	('1726467853610803229', 'This Post is from a suspended account. {learnmore}'),
	('1726539361335025819', 'Correction: extremely tpot-pilled https://t.co/5tehAHRVoG'),
	('1726538539360501887', '@nosilverv nah he’s bonafide tpot! idk where donmexlar went but the op was “how many ppl are in tpot” lol https://t.co/2EqZfnrkPE'),
	('1726347810046718061', 'Embarrassing confession: the formal definition of natural transformations always seemed pretty opaque to me (i.e. *why* is that the "natural" definition of a homomorphism between functors?) Until I started thinking about them as universal quantifications over morphisms. (1/7) https://t.co/zWxYXPx7n3'),
	('1726353148665569522', 'first and last time i ever wear one of these https://t.co/wKHg2d3dNk'),
	('1726335750130848007', 'recently carb-adapted after spending 2018-2022 in a state of ketosis – holy shit, so much energy. who was it that said carbs felt like LSD? was that @nosilverv?'),
	('1726345564059832609', 'first and last time i ever wear one of these https://t.co/u3iKwyWj0a'),
	('1726325189011456125', 'When meditators and spiritual types say "your body knows the answer" or "drop that question into your body," it can sound like gibberish to some people. 

But it really is this straightforward. https://t.co/Cjjn4ushZ9'),
	('1726308474387366077', 'You bolt awake in San Francisco. You are not in a simulation (so far as you know). It is November of 2023. You are Ilya Sutskever, and you have changed your mind. The future must not come to pass. OpenAI must burn.'),
	('1726316735811428629', 'This Post is from a suspended account. {learnmore}'),
	('1726320957080346909', 'The impulse to check your phone is like distilled tanha lol'),
	('1726314892658143497', 'You’re unable to view this Post because this account owner limits who can view their Posts. {learnmore}'),
	('1726303713977909430', '@gptbrooke i like vibecamper better than viber'),
	('1726304096452546794', '@gptbrooke VCs, obv'),
	('1726307825331409258', 'This Post is from a suspended account. {learnmore}'),
	('1726086761527279962', 'LessWrong is when someone says, "let''s rewrite the whole thing in python," but for 1000 years of philosophy'),
	('1725990238592340103', 'I think a lot of my weird behavior and beliefs comes from a sense of Deep Okayness. I''m deeply okay, you''re deeply okay. If you''re not afraid on some level of Wrongness, then you have a ton of space to explore lots of scary shit'),
	('1726213802587521420', '@neverendingftr help me the burnout is INSANE

like i literally ALREADY FIXED THE PROBLEM. but now i just dont wanna code'),
	('1726133305311936890', 'the Programming makes me want to Kill Myself!!!!!!!!'),
	('1726296485862486188', '3 followers so far, get in on the ground floor ppl https://t.co/C9sGZoHOC3'),
	('1654833376736550912', 'I think I''m gonna do it (go all in on happinessmaxxing)'),
	('1726296686581191032', '6 months in - it worked lol, sorry I’ve been posting less https://t.co/NnVDCWqBCN'),
	('1725948834646290468', 'One thing I’ll do in my 40s is trusting my gut, always.'),
	('1726276073363771639', 'I honestly don’t get how a dude with basically no technical skills is somehow the lynchpin to the personal computing revolution https://t.co/0WUorTepbk https://t.co/KV8ffuuVGu'),
	('1726287485595230497', '@42irrationalist That''s incredible, really. It means it is parsing properly the sides of the strip with no further context.'),
	('1726243905119883739', 'Six months married ❤️‍🔥

My best friend. My lover. My protector. My guide. My sweet, gentle, infinitely strong husband

What a beautiful, strange, loving life we are building together: there are no limits to our depths 

I was made to be at your side'),
	('1725955154946543752', 'Φ-SO : Physical Symbolic Optimization - Learning Physics from Data 🧠

The Physical Symbolic Optimization package uses deep reinforcement learning to discover physical laws from data. Here is Φ-SO discovering the analytical expression of a damped harmonic oscillator. https://t.co/CrOHHSZBCq'),
	('1725978668735054156', 'Indian mom vision: reading Mira Murathi instead of Mira Murati https://t.co/2jBXFA4ZmN'),
	('1726255772886307212', 'Cheat codes I know at 43 I wish I knew at 23: https://t.co/Qcz5zV6rfa'),
	('1726273769344491987', 'when you finally interpret the gpt-4 weights https://t.co/c0SeM98KSb'),
	('1726016075496579350', 'Cat that cracked the matrix 

📹leslyepenelope
https://t.co/K5d7SYnaFY'),
	('1726281054787670484', 'Some highlights from the last few months working at the UK AI Safety Institute (and its predecessor, the Taskforce).

I''m excited to keep pushing towards safe artificial general intelligence, from government @SciTechgovuk https://t.co/LLSPTNQEFy'),
	('1726249834967867440', ''),
	('1726271754509947062', 'i can''t believe i can just open up CAD in my web browser. the future is now https://t.co/v7OrspjFNw'),
	('1726275159164891154', 'If you''re doing it right, 

the tension between where you are and where you want to be can feel like a bowstring pulled to the exact right tautness 

and all you have to do to get the momentum started,

is to let go'),
	('1726206508294381843', '"Nooo you can''t just say things are carcinizing! It''s a very specific type of evolutionary process! Humans are not capable of--" https://t.co/uMj792KJYS'),
	('1812889047741730884', '@exgenesis What is Portal?'),
	('1726278350015181229', 'They talked to the funeral assistant about minutiae while I cried in a side room. They can do as they please, of course. I hope they find the peace to be able to simply sit with themselves at some point.'),
	('1726277715144446401', 'Saw my nanny’s body today. It is strange. As my mum and aunt talked, I decided to really connect with the experience and the lights suddenly flicker a bit. Only I noticed. It’s sad that she’s gone but even sadder that the people around me don’t seem to connect to their experience'),
	('1726276746943533086', 'I''m just saying that if I were the AI I''d have to eat the e/accs first just to hear them wail in horror as the things they love most (software jobs, dall-e illustrations in posts about buidling, juul pods) are irreversibly dissolved into quantum compute dust https://t.co/vI55Jcb5WJ'),
	('1725967099468636163', 'i am once again reminding Americans that Italy has its own equivalent of Olive Garden, it''s called Old Wild West and it serves burgers named "Apache",  "Navajo" and "Dakota" https://t.co/XIecchVQxd'),
	('1725981795999531387', 'Nice broad framework for interaction models around AI. Covers pretty much every approach I’ve seen to improving AI-assisted coding https://t.co/U7qTXpWHs0 https://t.co/TfR8xDdEQj'),
	('1726262490122830260', 'How are people liking Amo? Feels like a gorgeous hot mess to me. Wondering if I’m just old. 

Can barely figure out what it’s for or how to use it. So much flex at the expense of clarity. 

And the objective… - friend hoarding and memory collages? That’s the goal? 🤔 https://t.co/ZXsnyZ84hk'),
	('1726241889676939510', 'I cannot overstate how much writing about what you believe and what you’ve experienced

Forever changes how you read other writers on what they believed and what they’ve experienced'),
	('1725989065961419063', 'Neat paper on searching trees of agent actions — fun to see ReAct and Reflexion being pushed even further. Wonder how much juice there is left to squeeze out of this general strategy.

https://t.co/qD3pNumeD7'),
	('1726039960866951653', 'This Post is from a suspended account. {learnmore}'),
	('1726255091378950174', '🎉 It’s been One Year since I put out the Somatic Reaonance course 🥳 

Imma give out some 50% off codes

Reply with a gif of a small animal doing something adorable — I’ll give codes to the 5 I love the most https://t.co/1lTH1C5fJg'),
	('1726142800142422027', 'Preach https://t.co/BHHM3Zi1fq'),
	('1726216394495418687', 'What really happened at OpenAI https://t.co/SQ5WvRtNkZ'),
	('1726254408973873556', 'chatgpt said I’d enjoy Adyashanti’s teachings based on other teachers I enjoy. what’s a good place to start?'),
	('1726239487712436730', 'give so much with so much joy and love that the universe can''t help but surround you with unimaginable abundance in return'),
	('1726245625673499114', 'I keep playing with the trade-off between structure and "going with the flow". Too much structure is self-coercion. Too free-flowy won''t commit to anything difficult.  

There is a sweet spot that isn''t a compromise but a symbiosis. I can''t get to it reliably yet but here are..'),
	('1726237968489459860', '@exgenesis in the lisbon bay right https://t.co/rqlUZvh161'),
	('1726205129853149616', 'viajar sozinha está a ser divertido e até bastante seguro, só me chateia um bocado às vezes aperceber-me que se dividisse as coisas com outra pessoa seria tudo bem mais barato e confortável para mim como mulher'),
	('1725982252696248668', 'Welcome back to virtue ethics everyone, don''t be shy, we''ll find room for you 

Just a reminder that you''re still free to be utilitarian when it''s pragmatic and makes the moment beautiful 

Let''s just try to avoid totalizing frames going forward, okay? https://t.co/KpZsSAV1k0'),
	('1726234686073053211', '@exgenesis gfs rock'),
	('1726114957518074158', '"Power resides where men believe it resides. It''s a trick. A shadow on the wall. And a very small man can cast a very large shadow."

- Lord Varys, Game of Thrones S2E3. https://t.co/DsUUro1UeE'),
	('1726127734160777327', 'i''m making a spreadsheet of which openai employees have no heart'),
	('1723021459851722938', 'Here are some AI-generated triggers: https://t.co/tjkBalqqCs'),
	('1723015683330437478', 'It''s also an ask: If you have ~400 A100-hours to give &amp; want to see this project finished soon, please hit me up!'),
	('1723015075798151631', 'I wanna get less shy about sharing my projects even when unfinished, so here''s some notes on my ASMR generation project.

It includes:
- Some AI-generated ASMR clips
- How to build good data labelling tools
- Why ASMR generation is exciting

https://t.co/Wxb5l7uKv1'),
	('1725614318698242198', 'imagining the pressure this dad was under and how he just casually nailed it https://t.co/xluTghZSnV'),
	('1725962395149865040', 'Imagine just getting to hit your telos like this. Sublime. https://t.co/pA1TLsfT79'),
	('1726207180276146350', 'I think you could scrap the goal terminology (if it continues to add confusion in discussions due to conceptual collisions with things like ''utility functions''. or ''shards'' or ''preferences'' or ''reward functions'' etc...) and consider one property that intelligent agents might… https://t.co/2CFqgQPnpq'),
	('1726137752071377139', 'Philosophical errors have real consequences https://t.co/I2GVJZ8qlQ'),
	('1726103152049656052', 'I truly believe OpenAI team may become stronger than ever in the next few months. The greatest risk was expansion and being spread thin, a shifting culture. Can’t imagine anything that would bring us closer together, nothing that would ignite more passion to continue the mission.'),
	('1725967193483927554', 'Imagine if your whole life was being scooped up by a giant pair of arms, squished with a kiss, and set down to continue roaming.'),
	('1725842075533394188', 'How did someone who didn’t even finish their undergrad land their role as CEO at the most important company in America? https://t.co/0reC50kuT8 https://t.co/stRIZ4AiH8'),
	('1726131917765140625', '“Meta disbanded its Responsible AI team”

Nice timing for Facebook to get this inconvenient news out of the way, while everyone’s attention is still focused on another AI company 😏
https://t.co/48LjftyiZy'),
	('1725982797012119729', 'https://t.co/VsH8EEp1yI https://t.co/XlHUC7e4Ph'),
	('1725932793689989144', 'Look what I made today 🎨🖌️ https://t.co/KS5eK670hl'),
	('1726122676782342266', 'I yearn for a simpler time https://t.co/lIltyIVv4S'),
	('1726135266128371850', 'Flow is such an optimism-inducing phenomenon. It tells you that in EVERY activity there exists an incredibly tasty sweet spot that *literally* meets you where you’re at.'),
	('1726068314311627073', 'If OpenAI board fired @sama for straining charter, but market forces put him back, then Moloch wins'),
	('1726126197980230065', 'We''re reaching cringe levels that shouldn''t be possible https://t.co/pH3eHAja2V https://t.co/Yj1U5TBaYs'),
	('1725739792628133989', 'imagine joining a google meet call and it’s the entire board of directors minus your single best ally'),
	('1700892331858169990', ''),
	('1725940839484907559', 'I kinda do sense you gotta deal with your whole ancestral consciousness if you wanna go beyond it

like you gotta become and surpass your inner animist
become &amp; surpass your inner pagan
become &amp; surpass your inner christian
become &amp; surpass your inner atheist
become &amp; surpass yo'),
	('1726136972799057954', 'Scott Alexander writing up defences of the EAs right now like https://t.co/8d0zm2Wv6a'),
	('1726058402542244106', 'wow.

openai staff set a deadline of 5pm tonight for all board members to resign and bring sam and greg back, or else they all resign.

the board agreed but is now waffling and its an hour past the deadline.

this is all happening in real time, right now. https://t.co/nIfp0bjJxt'),
	('1725933595318268223', 'i think im antiea radicalized now

my friends treat their body like a playground (experiments with drugs, meditations, new exercises etc), cycle through dangerous sports, startups, and various ideologies. as a group nothing has hurt their wellbeing as much as ea as'),
	('1725974430055051558', 'The entirity of e/acc''s philosophy: bro, what if we just... Waluigi''ed EA lmaoooo

Cartoon supervillain ass grift smh'),
	('1725905625337467179', 'Our Gods want to be overcome, since they require renewal

- Jung https://t.co/MpHxmcq5NH'),
	('1725677399931494575', 'In retrospect this tweet called the top https://t.co/cVHd1hWGVs'),
	('1725865564751487297', 'Lol the backstage photo on the left looks better than the actual movie https://t.co/IUCXsi63SS'),
	('1725654086979371186', 'hey tpot fyi this is the incisive commentary you''re missing if you''re still blocked sucks to be you https://t.co/dD9HCixy6M'),
	('1712261495046992381', 'Insights seem to come faster and faster during the emotional ascent but burn away at the crest and become ultimately uninteresting and totally beside the point in the descent.'),
	('1725890205209473035', 'This is why I was made of nothing but bangers 1-2 years ago, and have fallen off ever since https://t.co/ebRxl7GF7Y'),
	('1725742088317534446', 'i love you all. 

today was a weird experience in many ways. but one unexpected one is that it has been sorta like reading your own eulogy while you’re still alive. the outpouring of love is awesome.

one takeaway: go tell your friends how great you think they are.'),
	('1725632332626116688', '"The board no longer has confidence in his ability to continue leading OpenAI." Footage of OpenAI headquarters has leaked live from San Francisco: https://t.co/zYNddm9Jta'),
	('1725825482266956270', 'Starting to feel like I don''t *deserve* to find an apartment

is this the same feeling as male-on-dating-app?'),
	('1725825488164204751', 'And it''s only been a couple weeks. People out here talk about searching for a year'),
	('1725828704406802786', 'The thing that’s broken for me here is the utter unresponsiveness, the futility

I do sth and it may or may not have an effect on the outcome…but prob none at all

Worse than 0 effect, bc then I could just stop doing it - UNKNOWABLE effect

I''ve been burning out
Hence depression https://t.co/uMyTlMjWK3 https://t.co/sd1TQ3nhQk'),
	('1725908220198428796', 'Frank Zappa:

1. don’t stop
2. keep going https://t.co/vFQYjFDtp1'),
	('1620362608904916992', 'guy: do you have any advice

me: show up, dont die, and dont quit

guy: lolll cmon gimme something more than that

me: nothing is more important than that. try and have fun, do 100 things, ask questions,

guy: see now we''re talking

6 years later: [guy quits]'),
	('1725908995162952020', 'At this point I''m pretty confident me being chill is an initial perception for many people. My brothers and sisters in Christ, my heart is BLAZING'),
	('1725908833107595269', 'It''s fascinating to me that people consistently perceive me as chill. I think it''s because most of my intensity is hidden from view or very, very carefully channeled through pathways that spread it out 

Like a polar bear sliding on a frozen lake'),
	('1725875835557593240', 'worship your subconscious like a god, for that which generates your world has vastly more computational power than you, so pray for happiness and strength and kindness to fill your world https://t.co/PgaTlrr28q'),
	('1725754615051002248', '@Joshua50054538 @meaning_enjoyer Yeah, and ultimately only each person can say if what they’re doing is their calling or something else https://t.co/TSEyuguLrL'),
	('1725882932672307663', 'This also shows $$$ support is not about size.

When somebody''s ready to WORK she will need very little.

It''s often really just a plane ticket, or one IRL meeting, or the chance to not work on anything else for 3 months (cf. accelerators).

Those ready will take it from there.'),
	('1725879811946520851', 'Hm. I really only started finding actual mentors who believed in me when I was around 33 years old...

Would have been great to have someone around with an interest to tell me I was smart and capable of bigger things.

(But those who knew wanted to use me in-house, and they did.) https://t.co/plvUy5KmmY'),
	('1725881446370353587', 'Mentorship is still insanely badly allocated. And when it happens to the right person, it puts her on an INSANE trajectory.

In 2019, when I was a penniless 35 year old triple immigrant restarting my formerly charmed life, a mutual who liked my tweets gave me and a friend $2,500… https://t.co/7efo2jOIO2'),
	('1725885778390073802', 'i made decent bread for the first time using a recipe chatgpt made for me thank you chatgpt'),
	('1725552759926083773', 'no end to the obscenity. on top of the slaughter, every day another symbolic gesture so perverse that it would feel heavy-handed in a movie or novel or whatever https://t.co/puiPTr66kt'),
	('1725884250614862007', '@soundrotator painting is an act of profound devotion to being. this alone makes it worth learning'),
	('1725700703468015941', 'the most beautiful part of my experience of this painting is the "someone looked at the light like this" feeling https://t.co/5e17GMEDqc'),
	('1725884251860549805', 'I hereby give you my unreserved permission:

to be shit

and to be having a shit time 

at whatever age you happen to be 

right now 🤗'),
	('1725883647990042852', 'Go Starship 🫡
Go SpaceX 🫡
Go Humanity 🫡
https://t.co/cjUaulaIEA'),
	('1725758484149395514', 'https://t.co/srHnd3hhVv https://t.co/1OGM1tk3Aw'),
	('1725852350269546737', '“Hippona Column, Constantinople”, Eugene Flandin (1803 – 1876), French https://t.co/85Z5gGO2F0'),
	('1725745633003475102', 'stories of gdb’s superhuman abilities from people who worked with him are wild. like when gpt4 first finished training it didn’t actually work very well and the whole team thought it’s over, scaling is dead…until greg went into a cave for weeks and somehow magically made it work'),
	('1725838857370005912', 'I know everyone is mad right now but this series of events incidentally validates the OpenAI org structure as having been credibly able to fulfill its original design goals. https://t.co/1NaIEK1EGx'),
	('1725590437639901256', 'Oh fuck, it turns out that all the annoying paradoxes presented in Zen literature are just straightforward descriptions of reality, which contains annoying paradoxes'),
	('1700892261901373852', ''),
	('1725788688939192474', 'Cool!

"Our results reveal increased power, energy and complexity of the connectome harmonic repertoire and demonstrate that meditation alters brain dynamics in a frequency selective manner."

"energy differences of the complete connectome harmonic spectrum between meditation and…'),
	('1725711519797633037', 'I think we now have confirmation of what happened. It was a coup by @ilyasut and some EA people to remove @sama and @gdb as they were going too fast.

Overall I think this is a mixed blessing.

It would have been much better if this could have been settled behind closed doors;… https://t.co/AfTprm8vuz'),
	('1725835690246549724', 'once again I have no way of knowing if Sam was prioritizing profits over mission, or if this has anything to do with the firing. But we should take a moment and applaud the founders, Sam included, for setting up an genuinely different kind of org. it''s a beautiful and rare thing'),
	('1725834823262969908', 'so many companies talk about being mission-driven and they almost all fold in the face of investor pressure. the board not even consulting investors before making the decision to fire the CEO (!) tells me the OpenAI charter was just not pro forma. They were for real.'),
	('1725834134520582502', 'weirdly my main reaction is gratitude to the OpenAI founders for actually creating a governance structure that committed them to sacrifice profits if the mission required it. no idea if that''s what happened here, but at least we know the commitment had teeth. https://t.co/4L1YM4v5Uv'),
	('1725770483486917077', 'I have a strong desire to make experimental ambient music. but I live in a tiny space so I need the gear to be super portable and I don''t want to use a laptop. any ideas?'),
	('1725659773792895441', 'barbell theory says that 90-99% of your efforts should be dedicated to building a nice, cozy, happy little life and then the remainder should be spent on longshots at becoming god emperor of the lightcone'),
	('1725735854675538200', ''),
	('1725733084258029757', '');


--
-- Data for Name: likes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '322603863', '1627038980352147458', 8),
	(2, '322603863', '1627038691825950720', 8),
	(3, '322603863', '1627039445253001219', 8),
	(22, '322603863', '1823637522087325732', 8),
	(23, '322603863', '1823418209455988868', 8),
	(24, '322603863', '1823347753755238619', 8),
	(25, '322603863', '1823347741168136382', 8),
	(26, '322603863', '1823347735145128187', 8),
	(27, '322603863', '1823347729990303816', 8),
	(28, '322603863', '1823347732653687002', 8),
	(29, '322603863', '1823347721358438624', 8),
	(30, '322603863', '1823697653320048788', 8),
	(31, '322603863', '1823690664862998844', 8),
	(32, '322603863', '1795738716604174362', 8),
	(33, '322603863', '1823508283300127187', 8),
	(34, '322603863', '1822966303642308903', 8),
	(35, '322603863', '1823660333564657844', 8),
	(36, '322603863', '1823552071452242220', 8),
	(37, '322603863', '1823671598911463631', 8),
	(38, '322603863', '1823552064363938254', 8),
	(39, '322603863', '1823552068868604085', 8),
	(40, '322603863', '1823478439875060100', 8),
	(41, '322603863', '1823626245348688380', 8),
	(42, '322603863', '1823632275453469080', 8),
	(43, '322603863', '1823655030404116482', 8),
	(44, '322603863', '1823654543067865491', 8),
	(45, '322603863', '1823604571845091426', 8),
	(46, '322603863', '1823460973921099858', 8),
	(47, '322603863', '1823502663180238904', 8),
	(48, '322603863', '1823631704419942834', 8),
	(49, '322603863', '1823588002075173033', 8),
	(50, '322603863', '1823554451824955570', 8),
	(51, '322603863', '1823553775480500390', 8),
	(52, '322603863', '1823552276264550545', 8),
	(53, '322603863', '1823549800035582254', 8),
	(54, '322603863', '1823549593466102132', 8),
	(55, '322603863', '1823549201239953531', 8),
	(56, '322603863', '1823548596274520551', 8),
	(57, '322603863', '1823547532682920007', 8),
	(58, '322603863', '1823547213890408516', 8),
	(59, '322603863', '1823546870322340041', 8),
	(60, '322603863', '1823545056130949547', 8),
	(61, '322603863', '1820551525305127342', 8),
	(62, '322603863', '1820632011331272930', 8),
	(63, '322603863', '1823497968093421978', 8),
	(64, '322603863', '1823499779248414828', 8),
	(65, '322603863', '1823483488521310509', 8),
	(66, '322603863', '1823485220622152111', 8),
	(67, '322603863', '1823490713784606835', 8),
	(68, '322603863', '1823469799588159651', 8),
	(69, '322603863', '1823412701441482959', 8),
	(70, '322603863', '1823467317520695461', 8),
	(71, '322603863', '1823457887206961380', 8),
	(72, '322603863', '1821945489756959017', 8),
	(73, '322603863', '1822791699858678063', 8),
	(74, '322603863', '1822816013622407483', 8),
	(75, '322603863', '1822837352919978041', 8),
	(76, '322603863', '1822293183235076115', 8),
	(77, '322603863', '1822897493773828281', 8),
	(78, '322603863', '1822011771902664787', 8),
	(79, '322603863', '1822874637694636331', 8),
	(80, '322603863', '1822795200252821882', 8),
	(81, '322603863', '1822698627200094689', 8),
	(82, '322603863', '1822639227097469121', 8),
	(83, '322603863', '1822637652597719214', 8),
	(84, '322603863', '1822673927702802439', 8),
	(85, '322603863', '1822799964902445298', 8),
	(86, '322603863', '1822734675703628079', 8),
	(87, '322603863', '1822732087180284128', 8),
	(88, '322603863', '1822730300507435195', 8),
	(89, '322603863', '1822861505106157575', 8),
	(90, '322603863', '1822500071880950223', 8),
	(91, '322603863', '1822921824340177046', 8),
	(92, '322603863', '1822923003165921294', 8),
	(93, '322603863', '1822922842582995068', 8),
	(94, '322603863', '1822922448997945422', 8),
	(95, '322603863', '1822922711888232779', 8),
	(96, '322603863', '1822754939715915916', 8),
	(97, '322603863', '1813173433217253794', 8),
	(98, '322603863', '1812930809759953058', 8),
	(99, '322603863', '1812926436623413285', 8),
	(100, '322603863', '1813157457151336472', 8),
	(101, '322603863', '1812856086459826298', 8),
	(102, '322603863', '1812856084643660191', 8),
	(103, '322603863', '1812856083381109042', 8),
	(104, '322603863', '1812926226807292036', 8),
	(105, '322603863', '1812672294973829360', 8),
	(106, '322603863', '1812671574845403391', 8),
	(107, '322603863', '1812944156748357636', 8),
	(108, '322603863', '1813024511572517159', 8),
	(109, '322603863', '1813017350423110129', 8),
	(110, '322603863', '1813117102355784013', 8),
	(111, '322603863', '1812943772717883452', 8),
	(112, '322603863', '1813127059079897461', 8),
	(113, '322603863', '1813086048693723400', 8),
	(114, '322603863', '1813036726836719647', 8),
	(115, '322603863', '1813018489638253043', 8),
	(116, '322603863', '1813003006457082254', 8),
	(117, '322603863', '1813003773473694165', 8),
	(118, '322603863', '1812949107969040784', 8),
	(119, '322603863', '1813002567447687412', 8),
	(120, '322603863', '1812928707016757706', 8),
	(121, '322603863', '1812991506451722533', 8),
	(122, '322603863', '1726630455078953322', 8),
	(123, '322603863', '1726640279795720683', 8),
	(124, '322603863', '1726641901544370513', 8),
	(125, '322603863', '1726634542210126197', 8),
	(126, '322603863', '1726638813559369947', 8),
	(127, '322603863', '1726292016995442846', 8),
	(128, '322603863', '1726555832736006342', 8),
	(129, '322603863', '1726370977188388971', 8),
	(130, '322603863', '1726634219097719184', 8),
	(131, '322603863', '1726632544056295927', 8),
	(132, '322603863', '1726631894610288696', 8),
	(133, '322603863', '1726630377555685770', 8),
	(134, '322603863', '1726635168847503498', 8),
	(135, '322603863', '1726635888787214629', 8),
	(136, '322603863', '1726621280974364729', 8),
	(137, '322603863', '1726634341328093419', 8),
	(138, '322603863', '1723477949478023457', 8),
	(139, '322603863', '1723480243875578347', 8),
	(140, '322603863', '1726624197739246042', 8),
	(141, '322603863', '1726623745077625201', 8),
	(142, '322603863', '1726634650314133969', 8),
	(143, '322603863', '1726620098356822215', 8),
	(144, '322603863', '1726607162846453989', 8),
	(145, '322603863', '1726602977526608160', 8),
	(146, '322603863', '1726609993687064906', 8),
	(147, '322603863', '1726598393139720594', 8),
	(148, '322603863', '1726611972882669899', 8),
	(149, '322603863', '1726593419408179540', 8),
	(150, '322603863', '1726600151027073374', 8),
	(151, '322603863', '1726603786112901543', 8),
	(152, '322603863', '1726594398098780570', 8),
	(153, '322603863', '1726604136861643043', 8),
	(154, '322603863', '1726588283252281852', 8),
	(155, '322603863', '1726587485738897822', 8),
	(156, '322603863', '1726531733527593414', 8),
	(157, '322603863', '1726582811623366795', 8),
	(158, '322603863', '1726581708114575504', 8),
	(159, '322603863', '1726452354671845594', 8),
	(160, '322603863', '1726452051297914936', 8),
	(161, '322603863', '1726451811446607899', 8),
	(162, '322603863', '1726450280202715490', 8),
	(163, '322603863', '1726450549602783389', 8),
	(164, '322603863', '1726450661284561123', 8),
	(165, '322603863', '1726449775728599193', 8),
	(166, '322603863', '1726575069894189081', 8),
	(167, '322603863', '1726526112019382275', 8),
	(168, '322603863', '1726527469002592653', 8),
	(169, '322603863', '1726404293840785853', 8),
	(170, '322603863', '1726539041179598856', 8),
	(171, '322603863', '1726535037091508704', 8),
	(172, '322603863', '1726366208432414882', 8),
	(173, '322603863', '1721904504130641965', 8),
	(174, '322603863', '1726480053004054692', 8),
	(175, '322603863', '1726508156304637987', 8),
	(176, '322603863', '1726482351340061076', 8),
	(177, '322603863', '1726467853610803229', 8),
	(178, '322603863', '1726539361335025819', 8),
	(179, '322603863', '1726538539360501887', 8),
	(180, '322603863', '1726347810046718061', 8),
	(181, '322603863', '1726353148665569522', 8),
	(182, '322603863', '1726335750130848007', 8),
	(183, '322603863', '1726345564059832609', 8),
	(184, '322603863', '1726325189011456125', 8),
	(185, '322603863', '1726308474387366077', 8),
	(186, '322603863', '1726316735811428629', 8),
	(187, '322603863', '1726320957080346909', 8),
	(188, '322603863', '1726314892658143497', 8),
	(189, '322603863', '1726303713977909430', 8),
	(190, '322603863', '1726304096452546794', 8),
	(191, '322603863', '1726307825331409258', 8),
	(192, '322603863', '1726086761527279962', 8),
	(193, '322603863', '1725990238592340103', 8),
	(194, '322603863', '1726213802587521420', 8),
	(195, '322603863', '1726133305311936890', 8),
	(196, '322603863', '1726296485862486188', 8),
	(197, '322603863', '1654833376736550912', 8),
	(198, '322603863', '1726296686581191032', 8),
	(199, '322603863', '1725948834646290468', 8),
	(200, '322603863', '1726276073363771639', 8),
	(201, '322603863', '1726287485595230497', 8),
	(202, '322603863', '1726243905119883739', 8),
	(203, '322603863', '1725955154946543752', 8),
	(204, '322603863', '1725978668735054156', 8),
	(205, '322603863', '1726255772886307212', 8),
	(206, '322603863', '1726273769344491987', 8),
	(207, '322603863', '1726016075496579350', 8),
	(208, '322603863', '1726281054787670484', 8),
	(209, '322603863', '1726249834967867440', 8),
	(210, '322603863', '1726271754509947062', 8),
	(211, '322603863', '1726275159164891154', 8),
	(212, '322603863', '1726206508294381843', 8),
	(213, '322603863', '1726278350015181229', 8),
	(214, '322603863', '1726277715144446401', 8),
	(215, '322603863', '1726276746943533086', 8),
	(216, '322603863', '1726271866506002477', 8),
	(217, '322603863', '1725983229436408046', 8),
	(218, '322603863', '1726264802085855526', 8),
	(219, '322603863', '1726155265647739182', 8),
	(220, '322603863', '1725967099468636163', 8),
	(221, '322603863', '1725981795999531387', 8),
	(222, '322603863', '1726262490122830260', 8),
	(223, '322603863', '1726241889676939510', 8),
	(224, '322603863', '1725989065961419063', 8),
	(225, '322603863', '1726039960866951653', 8),
	(226, '322603863', '1726255091378950174', 8),
	(227, '322603863', '1726142800142422027', 8),
	(228, '322603863', '1726216394495418687', 8),
	(229, '322603863', '1726254408973873556', 8),
	(230, '322603863', '1726239487712436730', 8),
	(231, '322603863', '1726245625673499114', 8),
	(232, '322603863', '1726237968489459860', 8),
	(233, '322603863', '1726205129853149616', 8),
	(234, '322603863', '1725982252696248668', 8),
	(235, '322603863', '1726234686073053211', 8),
	(236, '322603863', '1726114957518074158', 8),
	(237, '322603863', '1726127734160777327', 8),
	(238, '322603863', '1723021459851722938', 8),
	(239, '322603863', '1723015683330437478', 8),
	(240, '322603863', '1723015075798151631', 8),
	(241, '322603863', '1725614318698242198', 8),
	(242, '322603863', '1725962395149865040', 8),
	(243, '322603863', '1726207180276146350', 8),
	(244, '322603863', '1726137752071377139', 8),
	(245, '322603863', '1726103152049656052', 8),
	(246, '322603863', '1725967193483927554', 8),
	(247, '322603863', '1725842075533394188', 8),
	(248, '322603863', '1726131917765140625', 8),
	(249, '322603863', '1725982797012119729', 8),
	(250, '322603863', '1725932793689989144', 8),
	(251, '322603863', '1726122676782342266', 8),
	(252, '322603863', '1726135266128371850', 8),
	(253, '322603863', '1726068314311627073', 8),
	(254, '322603863', '1726126197980230065', 8),
	(255, '322603863', '1725940839484907559', 8),
	(256, '322603863', '1726136972799057954', 8),
	(257, '322603863', '1726058402542244106', 8),
	(258, '322603863', '1725933595318268223', 8),
	(259, '322603863', '1725974430055051558', 8),
	(260, '322603863', '1725905625337467179', 8),
	(261, '322603863', '1725677399931494575', 8),
	(262, '322603863', '1725865564751487297', 8),
	(263, '322603863', '1725654086979371186', 8),
	(264, '322603863', '1712261495046992381', 8),
	(265, '322603863', '1725890205209473035', 8),
	(266, '322603863', '1725742088317534446', 8),
	(267, '322603863', '1725632332626116688', 8),
	(268, '322603863', '1725825482266956270', 8),
	(269, '322603863', '1725825488164204751', 8),
	(270, '322603863', '1725828704406802786', 8),
	(271, '322603863', '1725908220198428796', 8),
	(272, '322603863', '1620362608904916992', 8),
	(273, '322603863', '1725908995162952020', 8),
	(274, '322603863', '1725908833107595269', 8),
	(275, '322603863', '1725875835557593240', 8),
	(276, '322603863', '1725754615051002248', 8),
	(277, '322603863', '1725882932672307663', 8),
	(278, '322603863', '1725879811946520851', 8),
	(279, '322603863', '1725881446370353587', 8),
	(280, '322603863', '1725885778390073802', 8),
	(281, '322603863', '1725552759926083773', 8),
	(282, '322603863', '1725884250614862007', 8),
	(283, '322603863', '1725700703468015941', 8),
	(284, '322603863', '1725884251860549805', 8),
	(285, '322603863', '1725883647990042852', 8),
	(286, '322603863', '1725758484149395514', 8),
	(287, '322603863', '1725852350269546737', 8),
	(288, '322603863', '1725745633003475102', 8),
	(289, '322603863', '1725838857370005912', 8),
	(290, '322603863', '1725590437639901256', 8),
	(291, '322603863', '1725739792628133989', 8),
	(292, '322603863', '1725788688939192474', 8),
	(293, '322603863', '1725711519797633037', 8),
	(294, '322603863', '1725835690246549724', 8),
	(295, '322603863', '1725834823262969908', 8),
	(296, '322603863', '1725834134520582502', 8),
	(297, '322603863', '1725770483486917077', 8),
	(298, '322603863', '1725659773792895441', 8),
	(299, '322603863', '1725735854675538200', 8),
	(300, '322603863', '1725733084258029757', 8);


--
-- Data for Name: mentioned_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
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
	('4519121', 'The Oatmeal', 'Oatmeal', '2024-09-04 07:40:12.665+00'),
	('7748752', 'Robin Hanson', 'robinhanson', '2024-09-04 07:40:12.665+00'),
	('8802752', 'g1', 'g1', '2024-09-04 07:40:12.665+00'),
	('9624742', 'Department of State', 'StateDept', '2024-09-04 07:40:12.667+00'),
	('14075928', 'The Onion', 'TheOnion', '2024-09-04 07:40:12.664+00'),
	('14110443', 'muneeb.btc', 'muneeb', '2024-09-04 07:40:12.668+00'),
	('14377979', 'Eric Jorgenson 📚 ☀️', 'EricJorgenson', '2024-09-04 07:40:12.666+00'),
	('14504859', 'DuckDuckGo', 'DuckDuckGo', '2024-09-04 07:40:12.664+00'),
	('14832563', 'Paras Chopra', 'paraschopra', '2024-09-04 07:40:12.667+00'),
	('14861745', 'Felix Reda', 'Senficon', '2024-09-04 07:40:12.664+00'),
	('15644021', 'Lotfullah Najafizada', 'LNajafizada', '2024-09-04 07:40:12.666+00'),
	('16589206', 'WikiLeaks', 'wikileaks', '2024-09-04 07:40:12.667+00'),
	('16632219', 'RTP2', 'RTP2', '2024-09-04 07:40:12.665+00'),
	('16877374', 'Matt Novak', 'paleofuture', '2024-09-04 07:40:12.665+00'),
	('16959075', '99% Johnny Graz', 'jvgraz', '2024-09-04 07:40:12.667+00'),
	('17064600', 'Rami Ismail / رامي', 'tha_rami', '2024-09-04 07:40:12.668+00'),
	('17261066', 'Adam Best', 'adamcbest', '2024-09-04 07:40:12.667+00'),
	('17891808', 'Jules Suzdaltsev', 'jules_su', '2024-09-04 07:40:12.668+00'),
	('18280363', 'Tyler Alterman', 'TylerAlterman', '2024-09-04 07:40:12.665+00'),
	('18463930', 'Drew Conway', 'drewconway', '2024-09-04 07:40:12.664+00'),
	('18650093', 'Committee to Protect Journalists', 'pressfreedom', '2024-09-04 07:40:12.667+00'),
	('19002346', 'Adam Harvey', 'adamhrv', '2024-09-04 07:40:12.665+00'),
	('19119809', 'W. Kamau Bell', 'wkamaubell', '2024-09-04 07:40:12.667+00'),
	('19736694', 'Robert Mahoney', 'RobertMMahoney', '2024-09-04 07:40:12.668+00'),
	('19981036', 'US Embassy Brussels', 'usembbrussels', '2024-09-04 07:40:12.667+00'),
	('20304663', 'Helen Ingram', 'drhingram', '2024-09-04 07:40:12.665+00'),
	('21125274', 'Flo Crivello', 'Altimor', '2024-09-04 07:40:12.667+00'),
	('24190981', 'Teen Vogue', 'TeenVogue', '2024-09-04 07:40:12.666+00'),
	('24333864', 'Nate', 'ThatsDruidic', '2024-09-04 07:40:12.665+00'),
	('24761783', 'Nick', 'nickcammarata', '2024-09-04 07:40:12.665+00'),
	('27921943', 'Carlos Bueno', 'Archivd', '2024-09-04 07:40:12.666+00'),
	('27966935', 'Khamenei.ir', 'khamenei_ir', '2024-09-04 07:40:12.665+00'),
	('35434105', 'Julia Wallace', 'julia_wallace', '2024-09-04 07:40:12.666+00'),
	('36223287', 'Casebash', 'casebash', '2024-09-04 07:40:12.663+00'),
	('39364684', 'chrissy teigen', 'chrissyteigen', '2024-09-04 07:40:12.665+00'),
	('40247252', 'Saad Mohseni', 'saadmohseni', '2024-09-04 07:40:12.666+00'),
	('40872043', 'Parlamento Europeu em Portugal', 'Europarl_PT', '2024-09-04 07:40:12.666+00'),
	('41689246', 'António Correia', 'antoniogcorreia', '2024-09-04 07:40:12.665+00'),
	('42740878', '𐫱 arcove 𐫱', 'dschorno', '2024-09-04 07:40:12.665+00'),
	('43962686', 'Holly Fletcher ‽', 'hollyfletcher', '2024-09-04 07:40:12.668+00'),
	('44787918', 'Hoda Katebi هدی کاتبی', 'hodakatebi', '2024-09-04 07:40:12.666+00'),
	('49413866', 'Randy Olson', 'randal_olson', '2024-09-04 07:40:12.665+00'),
	('49616273', 'Global Times', 'globaltimesnews', '2024-09-04 07:40:12.665+00'),
	('49683752', 'd. patrick rodgers', 'dpatrickrodgers', '2024-09-04 07:40:12.665+00'),
	('56285139', 'rosalind lucy', 'wholebodyprayer', '2024-09-04 07:40:12.664+00'),
	('57411021', 'CJR', 'CJR', '2024-09-04 07:40:12.666+00'),
	('58562226', 'Embassy of Israel to the USA', 'IsraelinUSA', '2024-09-04 07:40:12.665+00'),
	('72054137', 'Liana Machado ', 'lianamachado', '2024-09-04 07:40:12.664+00'),
	('73643768', 'diogo', 'recurring__', '2024-09-04 07:40:12.666+00'),
	('77263263', 'Paul d''Aoust', 'helioscomm', '2024-09-04 07:40:12.665+00'),
	('77731013', 'Konstantinos Dimopoulos', 'gnomeslair', '2024-09-04 07:40:12.666+00'),
	('83149503', 'Pedro Ponte', 'ponteakabridge', '2024-09-04 07:40:12.665+00'),
	('93885765', 'Prosthetic Knowledge', 'prostheticknowl', '2024-09-04 07:40:12.665+00'),
	('95092020', 'Dr Jordan B Peterson', 'jordanbpeterson', '2024-09-04 07:40:12.666+00'),
	('102375508', '𓋼', 'caelaurae', '2024-09-04 07:40:12.668+00'),
	('102851981', 'FrankJavCee', 'FrankJavCee', '2024-09-04 07:40:12.668+00'),
	('110396781', 'AJ+', 'ajplus', '2024-09-04 07:40:12.666+00'),
	('113834913', 'Antti Oulasvirta', 'oulasvirta', '2024-09-04 07:40:12.664+00'),
	('116624142', 'jason', 'jvmncs', '2024-09-04 07:40:12.664+00'),
	('118121242', 'Charles Bramesco', 'intothecrevasse', '2024-09-04 07:40:12.664+00'),
	('122085859', 'AB', 'AlannaBennett', '2024-09-04 07:40:12.667+00'),
	('122231268', 'Jesse Hawken', 'jessehawken', '2024-09-04 07:40:12.664+00'),
	('128308837', 'CPJ Africa', 'CPJAfrica', '2024-09-04 07:40:12.664+00'),
	('140048972', 'Alejandro Jodorowsky', 'alejodorowsky', '2024-09-04 07:40:12.665+00'),
	('144809872', 'Suomen Akatemia | Research Council of Finland', 'SuomenAkatemia', '2024-09-04 07:40:12.664+00'),
	('146209385', 'Elrond Hubbard', 'OwennnThomas', '2024-09-04 07:40:12.667+00'),
	('150281740', 'Seth Mandel', 'SethAMandel', '2024-09-04 07:40:12.664+00'),
	('158414847', 'The Daily Show', 'TheDailyShow', '2024-09-04 07:40:12.665+00'),
	('158858541', 'Malali Bashir', 'MalaliBashir', '2024-09-04 07:40:12.666+00'),
	('162441059', 'Kyle McDonald', 'kcimc', '2024-09-04 07:40:12.667+00'),
	('163384337', '𝖒𝖎𝖈𝖍𝖆𝖊𝖑𝖈𝖚𝖗𝖟𝖎', 'michaelcurzi', '2024-09-04 07:40:12.664+00'),
	('169686021', 'ye', 'kanyewest', '2024-09-04 07:40:12.667+00'),
	('172350880', 'reaghan', 'reaghanhunt', '2024-09-04 07:40:12.666+00'),
	('178479745', 'Michael Edward Johnson', 'johnsonmxe', '2024-09-04 07:40:12.667+00'),
	('182101428', 'Evan Selinger', 'EvanSelinger', '2024-09-04 07:40:12.664+00'),
	('183642910', 'A. Marinho e Pinto', 'marinhoepinto', '2024-09-04 07:40:12.664+00'),
	('184392168', 'A', 'iamamoum', '2024-09-04 07:40:12.664+00'),
	('185214623', 'Abundant Jess 💜', 'frideswyth', '2024-09-04 07:40:12.667+00'),
	('191666539', 'David Chapman', 'Meaningness', '2024-09-04 07:40:12.663+00'),
	('193553265', 'yatharth in LA', 'AskYatharth', '2024-09-04 07:40:12.665+00'),
	('215738021', 'celine.', 'a_scenic', '2024-09-04 07:40:12.667+00'),
	('216939636', 'Andrew Ng', 'AndrewYNg', '2024-09-04 07:40:12.664+00'),
	('226320142', 'James Martin, SJ', 'JamesMartinSJ', '2024-09-04 07:40:12.666+00'),
	('229745537', 'E-30 🍉', 'EvaArreguin', '2024-09-04 07:40:12.666+00'),
	('234398308', 'Eliane Brum', 'brumelianebrum', '2024-09-04 07:40:12.664+00'),
	('243138168', 'Eason C 😐', 'easoncxz', '2024-09-04 07:40:12.664+00'),
	('262050648', 'Kaleb Horton', 'kalebhorton', '2024-09-04 07:40:12.665+00'),
	('282948199', 'Captain Pleasure, Andrés Gómez Emilsson', 'algekalipso', '2024-09-04 07:40:12.664+00'),
	('291131695', 'Jon Allsop', 'Jon_Allsop', '2024-09-04 07:40:12.666+00'),
	('298510171', 'Stephen Zerfas', 'stephen_zerfas', '2024-09-04 07:40:12.665+00'),
	('316970336', 'Richard D. Bartlett', 'RichDecibels', '2024-09-04 07:40:12.665+00'),
	('322603863', '❤️‍🔥 xiq in NYC🔜 Aug 22', 'exgenesis', '2024-09-04 07:40:12.668+00'),
	('323541088', 'Ki Sweat', 'SimbaKi_', '2024-09-04 07:40:12.665+00'),
	('335083488', 'Darling Ulysse', 'benpence', '2024-09-04 07:40:12.665+00'),
	('345916366', 'muzzammil', 'Muzamillion', '2024-09-04 07:40:12.665+00'),
	('356500906', '_', 'gothcufk', '2024-09-04 07:40:12.664+00'),
	('358741497', 'Rateb Noori', 'RatebNoori', '2024-09-04 07:40:12.666+00'),
	('364803552', 'Catarina', 'catacumbando', '2024-09-04 07:40:12.666+00'),
	('395477244', 'Vsauce', 'tweetsauce', '2024-09-04 07:40:12.666+00'),
	('460216709', 'Qadir Habib', 'QadirHabib', '2024-09-04 07:40:12.666+00'),
	('506392979', 'Philip Oldfield', 'SustainableTall', '2024-09-04 07:40:12.665+00'),
	('552245790', '⭐️🇪🇸Tib🇵🇹⭐️', 'TiberiusRomanus', '2024-09-04 07:40:12.664+00'),
	('738931582728298496', 'logan', 'piloht', '2024-09-04 07:40:12.665+00'),
	('565050896', 'Katie Lienemann', 'katielienemann', '2024-09-04 07:40:12.664+00'),
	('571202103', 'Medium', 'Medium', '2024-09-04 07:40:12.664+00'),
	('585099893', 'Marcos Pires', 'MarcosPires18', '2024-09-04 07:40:12.668+00'),
	('585462708', 'christian', 'cxgonzalez', '2024-09-04 07:40:12.665+00'),
	('594175899', 'Mikel Jollett', 'Mikel_Jollett', '2024-09-04 07:40:12.666+00'),
	('594473757', '🤦🏻‍♀️', 'ritabarreiras', '2024-09-04 07:40:12.664+00'),
	('631293447', 'Mário Magalhães', 'mariomagalhaes_', '2024-09-04 07:40:12.664+00'),
	('636989940', 'Sharif Hassan', 'MSharif1990', '2024-09-04 07:40:12.666+00'),
	('713027211', 'maria', 'bitxing', '2024-09-04 07:40:12.665+00'),
	('716432228', 'StanceGrounded', '_SJPeace_', '2024-09-04 07:40:12.665+00'),
	('752422021', 'brent', '_brentbaum', '2024-09-04 07:40:12.664+00'),
	('776665555', '𓁼 Matt Bailey 𓁼', 'BAILEYDRAWS', '2024-09-04 07:40:12.667+00'),
	('819427188', 'ethan', 'EthanReeder', '2024-09-04 07:40:12.664+00'),
	('820288038', 'RomeoStevens', 'RomeoStevens76', '2024-09-04 07:40:12.664+00');


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
	('1627031510963441664', '322603863', '2023-02-18 19:45:15+00', 'Another lesson is: there''s a lot of trash, many not-very-contentful tweets, and it''s not trivial to separate them, but we can always train a classifier, or honestly just use an LLM w few-shot examples', 0, 3, '1627019761950375936', '322603863', 'exgenesis', 8),
	('1626922779105759235', '322603863', '2023-02-18 12:33:11+00', '@empathy2000 did NOT know but now I''m listening to her solo act bc of u', 0, 1, '1626916612560281601', '732980797985148928', 'Empathy2000', 8),
	('1626908498134020098', '322603863', '2023-02-18 11:36:27+00', '@empathy2000 I''m obsessed', 0, 1, '1626904491957133312', '732980797985148928', 'Empathy2000', 8),
	('1002962678732804102', '322603863', '2018-06-02 17:18:31+00', '@Diogoramooos ent', 0, 0, '1002956769952444416', '1173194520', 'jjjj__jjjj_jjj', 8),
	('1002956457950810118', '322603863', '2018-06-02 16:53:48+00', '@Diogoramooos Vai trabalhar crl Also guitarra amanhã', 0, 0, '1002956117872467968', '1173194520', 'jjjj__jjjj_jjj', 8),
	('1002906982913904640', '322603863', '2018-06-02 13:37:12+00', '@caelaurae &lt;3', 0, 1, '1002905796781465601', '102375508', 'caelaurae', 8),
	('1002712018883874821', '322603863', '2018-06-02 00:42:29+00', 'RT @joaoocaralho: https://t.co/ZmnWFy1NSg', 0, 0, NULL, NULL, NULL, 8),
	('1002676399659012097', '322603863', '2018-06-01 22:20:57+00', 'RT @ExGenesis: https://t.co/5m0DjMETki', 0, 0, NULL, NULL, NULL, 8),
	('1002675477138599938', '322603863', '2018-06-01 22:17:17+00', 'RT @vinnybrack: LMFAOOOOOOOO https://t.co/5nq19l6tqj', 0, 0, NULL, NULL, NULL, 8),
	('1002633142753251328', '322603863', '2018-06-01 19:29:03+00', '@caelaurae Tb me acontece bué mais assim', 0, 0, '1002627907523633152', '102375508', 'caelaurae', 8),
	('1002623460273786880', '322603863', '2018-06-01 18:50:35+00', '@caelaurae Foi awkward?', 0, 0, '1002621384122564615', '102375508', 'caelaurae', 8),
	('1002620152515526657', '322603863', '2018-06-01 18:37:26+00', '@PapicoWindek É bué', 0, 1, '1002550589685977088', '1886742709', 'PapicoWindek', 8),
	('1002578140374413312', '322603863', '2018-06-01 15:50:30+00', '@_m0p_ @ttrincea @Diogoramooos Mor vai ao médico', 0, 0, '1002571441806696450', '1416464672', NULL, 8),
	('1002547128877682690', '322603863', '2018-06-01 13:47:16+00', '@Clitooris disse orientação pq as pessoas falam em orientação', 0, 0, '1002536940430938112', '382826992', NULL, 8),
	('1823634222805864549', '322603863', '2024-08-14 08:14:14+00', '@actualhog what keys?', 0, 0, '1823588002075173033', '976267215812034560', 'actualhog', 8),
	('1823634131403583929', '322603863', '2024-08-14 08:13:53+00', '@TheJointleman 😂', 0, 0, '1823631704419942834', '1170064144411897857', 'TheJointleman', 8),
	('1823494196587642985', '322603863', '2024-08-13 22:57:50+00', '@TylerAlterman let’s go Tyler', 0, 1, '1823469799588159651', '18280363', 'TylerAlterman', 8),
	('1823479560458891724', '322603863', '2024-08-13 21:59:40+00', 'in my “openphil doesn’t think this is high impact” era', 0, 11, NULL, NULL, NULL, 8),
	('1823467684610351292', '322603863', '2024-08-13 21:12:29+00', 'in my "getting told to scope my proposal" era', 0, 5, NULL, NULL, NULL, 8),
	('1823445398502994378', '322603863', '2024-08-13 19:43:55+00', '@_deepfates @DefenderOfBasic @_brentbaum @Tangrenin building here but not live yet

https://t.co/Wi4yfWIX55', 0, 1, '1823393725751702001', '1747709313920188416', '_deepfates', 8),
	('1627019761950375936', '322603863', '2023-02-18 18:58:34+00', 'into the thick of it!

some lessons:

We don''t want clustering we want TOPIC MODELLING, tweets can be about more than 1 thing

also, topic modelling my tweets is HARD, my best stuff is interdisciplinary and that sends models for a loop

anyway we got some coherent topics!!!!!!!! https://t.co/XOWm3INJng', 0, 6, '1626699961042698240', '322603863', 'exgenesis', 8),
	('1626902980006932483', '322603863', '2023-02-18 11:14:31+00', 'music update:

my Spotify history for the past 48h has consisted solely of Caroline polacheck, jockstrap, and the pom-poms', 0, 8, NULL, NULL, NULL, 8),
	('1626871062343327744', '322603863', '2023-02-18 09:07:41+00', '@selentelechia @meditationstuff omg me for like a year', 0, 1, '1626870349575880705', '990430425825755138', 'selentelechia', 8),
	('1626745546156257281', '322603863', '2023-02-18 00:48:56+00', '@42irrationalist @tszzl They''re called Russian mountains in Portuguese', 0, 10, '1626745216307720192', '1248684884790587393', '42irrationalist', 8),
	('1823416171481235602', '322603863', '2024-08-13 17:47:47+00', '@casebash @TylerAlterman flowiness, unstuck nervous system, if you buy principles of vasocomputation, it probably unsticks smooth muscle latches that cause suffering and reduce awareness / cognitive flexbility', 0, 2, '1823414622755676534', '36223287', 'casebash', 8),
	('1823411111334699182', '322603863', '2024-08-13 17:27:40+00', '@loopholekid @cxgonzalez Yup I’m putting my foot on the gas', 0, 2, '1823410873605500995', '1915273423', 'loopholekid', 8),
	('1823404289043091746', '322603863', '2024-08-13 17:00:34+00', '@casebash @TylerAlterman @RomeoStevens76 @jhanatech @nickcammarata @johnsonmxe @Meaningness Oh also in person events', 0, 1, '1823403834997113062', '322603863', 'exgenesis', 8),
	('1823403834997113062', '322603863', '2024-08-13 16:58:46+00', '@casebash @TylerAlterman @RomeoStevens76 @jhanatech @nickcammarata @johnsonmxe @Meaningness we can make it go faster if we nurture it by connecting people’s systems, let the scene see itself more clearly by doing podcasts, interviews, lit reviews, etc', 0, 2, '1823403377881145373', '322603863', 'exgenesis', 8),
	('1823403377881145373', '322603863', '2024-08-13 16:56:57+00', '@casebash @TylerAlterman and how do we get those explanations? Well here on twitter we have a budding pre paradigmatic research sweatshop of ppl with systematic minds exploring this stuff and sharing what they find - think @RomeoStevens76 @jhanatech @nickcammarata @johnsonmxe @Meaningness to name a few', 0, 2, '1823402655751840102', '322603863', 'exgenesis', 8),
	('1823402655751840102', '322603863', '2024-08-13 16:54:04+00', '@casebash @TylerAlterman I have a post coming on that topic but tldr: take EA and rat burnouts and intro to practices like meditation, qi gong, therapy modalities like focusing, it’s, core transformation while - crucially - providing coherent systematic explanations for how these things may work', 0, 2, '1823389532605309420', '36223287', 'casebash', 8),
	('1823388793677795589', '322603863', '2024-08-13 15:58:59+00', '@casebash @TylerAlterman would be one way to phrase my ideal of postrat', 0, 0, '1823388585807970739', '322603863', 'exgenesis', 8),
	('1823388585807970739', '322603863', '2024-08-13 15:58:10+00', '@casebash @TylerAlterman postrats are rats w one fewer cognitive bias: they know they’re embodied and embedded and limited and give proper credence to intuition and subjective experience', 0, 0, '1823385997561954755', '36223287', 'casebash', 8),
	('1823379563721662810', '322603863', '2024-08-13 15:22:19+00', '@tautologer @br___ian something I have in mind for later is letting people filter what tweets even leave their computer in the first place:  filter by date, by keyword, etc', 0, 2, '1823379265825407334', '322603863', 'exgenesis', 8),
	('1823379265825407334', '322603863', '2024-08-13 15:21:08+00', '@tautologer @br___ian absolutely, people shouldn''t take privacy for granted especially if they don''t know us :)', 0, 2, '1823379084208116221', '1389683959412396032', 'tautologer', 8),
	('1823378807111213369', '322603863', '2024-08-13 15:19:19+00', '@cxgonzalez I mean I would personally like that you don''t have to do anything', 0, 3, '1823378703193113048', '322603863', 'exgenesis', 8),
	('1823378703193113048', '322603863', '2024-08-13 15:18:54+00', '@cxgonzalez woohoo (yes)', 0, 3, '1823378586469855620', '585462708', 'cxgonzalez', 8),
	('1823378044418998342', '322603863', '2024-08-13 15:16:17+00', '@cxgonzalez &lt;333333333333 suddenly i feel more aligned w u even tho we didn''t have a concrete disagreement before', 0, 2, '1823377103510819212', '585462708', 'cxgonzalez', 8),
	('1823377858527375409', '322603863', '2024-08-13 15:15:32+00', '@br___ian @tautologer our code is open source and you can read it in the front end,  sensitive data like dms and your email don''t leave your computer

also deleted tweets are in a separate file which also won''t leave your computer', 0, 3, '1823377016672108706', '973083181640335360', 'br___ian', 8),
	('1823376748882395372', '322603863', '2024-08-13 15:11:08+00', '@_deepfates @DefenderOfBasic @_brentbaum @Tangrenin I hope to have a write-up in the next few days!', 0, 2, '1823375390150435260', '1747709313920188416', '_deepfates', 8),
	('1823376636487569722', '322603863', '2024-08-13 15:10:41+00', '@cxgonzalez I don''t know how hard or important providing overriding reasons is but that sounds right to me 

you do things bc you want to!', 0, 2, '1823375894313914541', '585462708', 'cxgonzalez', 8),
	('1823371512516051341', '322603863', '2024-08-13 14:50:19+00', '@cxgonzalez there we gooooooooooo', 0, 2, '1823364716535644393', '585462708', 'cxgonzalez', 8),
	('1823371099331043613', '322603863', '2024-08-13 14:48:41+00', '@jvmncs @DefenderOfBasic @_brentbaum @Tangrenin Not yet and I’m only vaguely aware of it - any recs for reading?', 0, 0, '1823370266090590305', '116624142', 'jvmncs', 8),
	('1823369671677993267', '322603863', '2024-08-13 14:43:00+00', '@br___ian yes PLEASE I need help convincing people to even just download their archive in the first place', 0, 6, '1823365111664587192', '973083181640335360', 'br___ian', 8),
	('1823369575313887291', '322603863', '2024-08-13 14:42:37+00', 'RT @br___ian: everyone should do this i wanna be able to ask an LLM for tpot''s 20 most esoteric headache remedies', 0, 0, NULL, NULL, NULL, 8),
	('1823344256934719999', '322603863', '2024-08-13 13:02:01+00', '@DefenderOfBasic, @_brentbaum, @Tangrenin and I are working on a public community db that anyone will be able to query read and build on top of - with extra privacy / data filtering options coming soon', 0, 35, '1823343978336432505', '322603863', 'exgenesis', 8),
	('1823343978336432505', '322603863', '2024-08-13 13:00:55+00', 'it''ll ask you for 2FA but it''s worth it, and once you have it it''ll be easier to do upload it to an open db and do cool search and analysis and extra fun stuff on top of it', 0, 19, '1823343756101243378', '322603863', 'exgenesis', 8),
	('1755406989323321856', '322603863', '2024-02-08 01:43:34+00', '@UntilTrees ahhh it’s one of those millions of things where you need to be good to enjoy it', 0, 1, '1755406591187177810', '1346407778647212032', 'UntilTrees', 8),
	('1823343756101243378', '322603863', '2024-08-13 13:00:02+00', 'a lot of value was produced in tpot conversations over the years and it would be amazing to preserve the "tpot canon" somehow, since twitter is stingy with data

I want to ask you to request your twitter archive 🙏 🥹 so we can work w it later https://t.co/B7a1YIYy8O', 4, 60, NULL, NULL, NULL, 8),
	('1823333282433446046', '322603863', '2024-08-13 12:18:25+00', 'can AI-facilitated IFS help with hyperhydrosis? stay tuned', 0, 7, NULL, NULL, NULL, 8),
	('1823332670908105026', '322603863', '2024-08-13 12:15:59+00', '@TylerAlterman we can do both we can have rigorous postrats', 0, 4, '1823059432340955624', '18280363', 'TylerAlterman', 8),
	('1823332501319733672', '322603863', '2024-08-13 12:15:18+00', 'just got destroyed and redeemed by my enneagram type 5', 0, 11, NULL, NULL, NULL, 8),
	('1823061202550816882', '322603863', '2024-08-12 18:17:16+00', '@throwaway__11 ty!', 0, 1, '1823058778230595634', '1594947702181199872', 'throwaway__11', 8),
	('1822962585412526166', '322603863', '2024-08-12 11:45:24+00', 'if you take wisdom as skilfuly toggling between perspectives (a la the 9 dot problem)

and compassion as motivation to take others'' perspectives

it seems like compassion works as a perspective acquisition engine, improving wisdom

could explain why the wise are so often kind', 2, 22, NULL, NULL, NULL, 8),
	('1822951295336038785', '322603863', '2024-08-12 11:00:32+00', '@jaivinwylde caught the exact moment elon auralized https://t.co/5t9gy7ygCm', 0, 1, NULL, '1165044870362189824', 'jaivinwylde', 8),
	('1822743481581703396', '322603863', '2024-08-11 21:14:45+00', '@gptbrooke 😭', 0, 1, '1822742327133389012', '1283792798886408192', 'gptbrooke', 8),
	('1822736878296330671', '322603863', '2024-08-11 20:48:31+00', 'if I could go back in time and tell my young self one thing it would be REMEMBER EXAMPLES AND STORIES FOR INSIGHTS YOU GET - KEEP THE RECEIPTS', 3, 31, NULL, NULL, NULL, 8),
	('1822706234987786728', '322603863', '2024-08-11 18:46:45+00', 'type of guy that advises you not to multi class and can’t help but multi class', 0, 9, NULL, NULL, NULL, 8),
	('1822697964004884927', '322603863', '2024-08-11 18:13:53+00', '@systemicized bc you live in CANADA 

HAPPY BIRTHDAY UROOJ 🎉🎉🎉🫶', 0, 3, '1822693088319451471', '948342296751296512', 'systemicized', 8),
	('1814786402057441423', '322603863', '2024-07-20 22:16:10+00', 'Michael Levin on consciousness as a spectrum : “I think that potential energy and least action principles are the tiniest hopes and dreams that there are”', 0, 7, NULL, NULL, NULL, 8),
	('1814656545872818663', '322603863', '2024-07-20 13:40:09+00', 'RT @loopholekid: so grateful I got to contribute to this funky space https://t.co/4F0FQbJs1T', 0, 0, NULL, NULL, NULL, 8),
	('1814409585144275438', '322603863', '2024-07-19 21:18:49+00', '@wholebodyprayer I think it’s audiation, same as when you’re a musician and are able to hear notes before playing them', 0, 5, '1814409203613872456', '56285139', 'wholebodyprayer', 8),
	('1814330871022759942', '322603863', '2024-07-19 16:06:02+00', 'RT @this_is_silvia: my job today at Portal https://t.co/SPvgDrUDcy', 0, 0, NULL, NULL, NULL, 8),
	('1814329297231909376', '322603863', '2024-07-19 15:59:47+00', 'RT @sporadicalia: silence silly Viking-roleplayers, the real Europe is talking https://t.co/NmE2smwOfl', 0, 0, NULL, NULL, NULL, 8),
	('1814329151328821533', '322603863', '2024-07-19 15:59:12+00', '@cxgonzalez awwwww', 0, 4, '1814304356402876852', '585462708', 'cxgonzalez', 8),
	('1814325347694882894', '322603863', '2024-07-19 15:44:06+00', 'RT @emergentvibe: Portal art beginning to flourish https://t.co/YnsOCMI7yk', 0, 0, NULL, NULL, NULL, 8),
	('1814325308792635752', '322603863', '2024-07-19 15:43:56+00', 'RT @loopholekid: the portal is speaking, are you listening?', 0, 0, NULL, NULL, NULL, 8),
	('1814310482741703003', '322603863', '2024-07-19 14:45:02+00', '@strangestloop art!', 0, 1, '1814308743074517036', '1163927704049262592', 'strangestloop', 8),
	('1814279211143540834', '322603863', '2024-07-19 12:40:46+00', 'Hosting Portal has its challenges but it has been super fulfilling and I’m learning a lot of subtle pragmatic decision making lessons', 0, 31, NULL, NULL, NULL, 8),
	('1814277909151990215', '322603863', '2024-07-19 12:35:35+00', '2nd Portal Potluck happening tonight :) https://t.co/Y3LvUyiXRT', 0, 28, NULL, NULL, NULL, 8),
	('1814241187156353420', '322603863', '2024-07-19 10:09:40+00', '@aleksil79 yuuuup', 0, 1, '1814036486964040007', '804213003197546496', 'aleksil79', 8),
	('1008832033546752000', '322603863', '2018-06-18 22:01:14+00', '&lt;3 https://t.co/8cpVcsyTFT', 0, 1, NULL, NULL, NULL, 8),
	('863522245435678720', '322603863', '2017-05-13 22:32:01+00', 'tÁ GANHO', 0, 0, NULL, NULL, NULL, 8),
	('1814062601283719303', '322603863', '2024-07-18 22:20:02+00', 'RT @chercher_ai: I grant you amnesty from needing to have a double blind controlled trial to explain your every experience', 0, 0, NULL, NULL, NULL, 8),
	('1814055988879642788', '322603863', '2024-07-18 21:53:45+00', '@VividVoid_ @keta_mean_ me too :c', 0, 2, '1813758313810767990', '1044604087013015552', 'VividVoid_', 8),
	('1814049883927502946', '322603863', '2024-07-18 21:29:30+00', '@algekalipso yup, for sure', 0, 2, '1813856212586553598', '282948199', 'algekalipso', 8),
	('1814033228719681756', '322603863', '2024-07-18 20:23:19+00', 'biology is just reverse engineering alien tech', 0, 10, NULL, NULL, NULL, 8),
	('1813859159399702849', '322603863', '2024-07-18 08:51:38+00', 'Tree week looks STACKED https://t.co/6cVtcqQ3X1', 1, 16, NULL, NULL, NULL, 8),
	('1813701956986458362', '322603863', '2024-07-17 22:26:58+00', '@loopholekid I so wish you were there, sorry I didn''t think of doing it earlier ;-;', 0, 1, '1813691251075739746', '1915273423', 'loopholekid', 8),
	('1813697117829079336', '322603863', '2024-07-17 22:07:44+00', '@michaelcurzi good point', 0, 2, '1813659929338851580', '163384337', 'michaelcurzi', 8),
	('1757477291909857694', '322603863', '2024-02-13 18:50:13+00', '@EthanReeder also sf has been 50 ppl events and Berkeley has been 1-10 people events which is much much nicer', 0, 1, '1757477175060742246', '322603863', 'exgenesis', 8),
	('1757477175060742246', '322603863', '2024-02-13 18:49:45+00', '@EthanReeder wanting to go to sf for things but feeling like 😩

fwiw I think a big part of it is a lot of the times I''ve been to SF have been at night, after work - whereas in Berkeley I often hang out during the day when it''s nicer', 0, 2, '1757476400725139656', '819427188', 'EthanReeder', 8),
	('1757264787778777139', '322603863', '2024-02-13 04:45:48+00', '@pee_zombie dang', 0, 1, '1757173212394533176', '1278573670739464192', 'pee_zombie', 8),
	('1757264719000568201', '322603863', '2024-02-13 04:45:32+00', '@pee_zombie it has no right being this good - she just wants to get to know and help the humans before they get old 😭', 0, 1, '1757172830620586452', '1278573670739464192', 'pee_zombie', 8),
	('1757251409148629323', '322603863', '2024-02-13 03:52:38+00', 'My experience in Berkeley is so far is like 10x better than in SF', 0, 38, NULL, NULL, NULL, 8),
	('1756777829197336704', '322603863', '2024-02-11 20:30:48+00', 'What if we did principal component analysis on all human stories to really get to those archetypal nuggets', 0, 21, NULL, NULL, NULL, 8),
	('1011905450680479745', '322603863', '2018-06-27 09:33:54+00', 'esse david lynch é bro', 0, 0, NULL, NULL, NULL, 8),
	('1756482501575647247', '322603863', '2024-02-11 00:57:16+00', 'RT @nosilverv: I''m legit annoyed that the default is for people to try to do stuff (write, think) before they''ve lived life lol. Like, ofc…', 0, 0, NULL, NULL, NULL, 8),
	('1756482491651903973', '322603863', '2024-02-11 00:57:14+00', '@nosilverv Banger', 0, 2, '1756480089796059481', '1163743742764998658', 'nosilverv', 8),
	('1756471209573949478', '322603863', '2024-02-11 00:12:24+00', '@gptbrooke In retrospect I think this reply came closest to an answer', 0, 1, '1701060897165455465', '1283792798886408192', 'gptbrooke', 8),
	('1756366546321203508', '322603863', '2024-02-10 17:16:31+00', '@cxgonzalez Love this for you, missing my Iberian peninsula 😭', 0, 1, '1756355008839180533', '585462708', 'cxgonzalez', 8),
	('1756220446649745665', '322603863', '2024-02-10 07:35:58+00', '@AskYatharth lol yes', 0, 2, '1756219710767812688', '193553265', 'AskYatharth', 8),
	('1756206339087270107', '322603863', '2024-02-10 06:39:54+00', 'RT @RomeoStevens76: @TylerAlterman "My dance is all motion without, all silence within. As much as I love to  make music, it''s the unheard…', 0, 0, NULL, NULL, NULL, 8),
	('1756170469466669524', '322603863', '2024-02-10 04:17:22+00', 'ngl this looks overengineered to hell https://t.co/drDYrW2NuM https://t.co/6BCzBr3b3S', 1, 15, NULL, NULL, NULL, 8),
	('1756091117093974494', '322603863', '2024-02-09 23:02:03+00', '@8teAPi https://t.co/XmxE10syOe

those are probabilities for an ai capable of building a Dyson sphere, not for the sphere happening

I made the same mistake', 0, 3, '1726113584240042185', '1392773380449857537', '8teAPi', 8),
	('1756090582769046014', '322603863', '2024-02-09 22:59:56+00', '@loopholekid &lt;3', 0, 4, '1756048015058493891', '1915273423', 'loopholekid', 8),
	('1755622932787982609', '322603863', '2024-02-08 16:01:39+00', '@pachabelcanon @the_wilderless I think you’re right', 0, 0, '1755530035341996275', '1600646881734184960', 'pachabelcanon', 8),
	('1755426879832743972', '322603863', '2024-02-08 03:02:37+00', '@UntilTrees I’d really enjoy that!', 0, 1, '1755408418133696620', '1346407778647212032', 'UntilTrees', 8),
	('1008829966476365824', '322603863', '2018-06-18 21:53:01+00', 'RT @jvaldez666: Simpson’s predicting the final 🤔 https://t.co/wspEPdChIQ', 0, 0, NULL, NULL, NULL, 8),
	('1755369442987667766', '322603863', '2024-02-07 23:14:23+00', '@RomeoStevens76 That’s about as far as I’ll go I think, 

and is consistent with why I haven’t really engaged w complicated systems like Hegel or Whitehead even though they sem resonant whenever ppl bring them up, too much overhead for a sample', 0, 5, '1755352237478732275', '820288038', 'RomeoStevens76', 8);


--
-- Data for Name: tweet_media; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tweet_media" ("media_id", "tweet_id", "media_url", "media_type", "width", "height", "archive_upload_id") VALUES
	(1627018396180140033, '1627019761950375936', 'https://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg', 'photo', 1176, 898, 8),
	(1822951237626576896, '1822951295336038785', 'https://pbs.twimg.com/media/GUxsfgGXQAArZAG.jpg', 'photo', 2048, 1214, 8),
	(1814423238409129985, '1814656545872818663', 'https://pbs.twimg.com/media/GS4gUnWXEAEgRmt.jpg', 'photo', 1536, 2048, 8),
	(1814298919746015232, '1814330871022759942', 'https://pbs.twimg.com/media/GS2vQUPWEAA1xGC.jpg', 'photo', 2048, 1153, 8),
	(1812643918271397888, '1814329297231909376', 'https://pbs.twimg.com/media/GSfOCjTWwAAE2Qc.jpg', 'photo', 682, 788, 8),
	(1814071447553216512, '1814325347694882894', 'https://pbs.twimg.com/media/GSzgXsSWkAApLtl.jpg', 'photo', 2048, 1209, 8),
	(1814277902415831040, '1814277909151990215', 'https://pbs.twimg.com/media/GS2cI8lWIAAbdKO.jpg', 'photo', 720, 1280, 8),
	(1756170463150018560, '1756170469466669524', 'https://pbs.twimg.com/media/GF8ru00XEAAW0uH.jpg', 'photo', 800, 1200, 8),
	(1011965575759884291, '1012011021333131265', 'https://pbs.twimg.com/media/Dgs5VFwXcAMAEOQ.jpg', 'photo', 720, 711, 8),
	(1011693463736332288, '1011712476017197058', 'https://pbs.twimg.com/media/DgpB2FeWsAAFgGg.jpg', 'photo', 843, 682, 8),
	(1011060961053159424, '1011060968279957504', 'https://pbs.twimg.com/media/DggCllXWsAAlLzm.jpg', 'photo', 1536, 2048, 8),
	(1011029449649745920, '1011060312173367297', 'https://pbs.twimg.com/media/Dgfl7YPU8AAfI8V.jpg', 'photo', 749, 856, 8),
	(1011009891790671873, '1011013046796537862', 'https://pbs.twimg.com/media/DgfUI9iW0AEhGGb.jpg', 'photo', 720, 397, 8),
	(1006693390711492608, '1010909198962647040', 'https://pbs.twimg.com/media/Dfh-Th8XkAAF_5i.jpg', 'photo', 1081, 553, 8),
	(1010110227931455494, '1010597589035704320', 'https://pbs.twimg.com/media/DgSh5ofX4AYTL9l.jpg', 'photo', 1242, 1661, 8),
	(1010222526281240576, '1010222527719895040', 'https://pbs.twimg.com/media/DgUICQcXUAASLQ0.jpg', 'photo', 960, 1280, 8),
	(1010220809984593920, '1010220849939599360', 'https://pbs.twimg.com/media/DgUGeWvW0AAB-gF.jpg', 'photo', 1536, 2048, 8),
	(1010137691562770432, '1010202232082587648', 'https://pbs.twimg.com/media/DgS64OfVAAAVgOe.jpg', 'photo', 700, 699, 8),
	(1010200324135702528, '1010200331722977282', 'https://pbs.twimg.com/media/DgTz17AX0AA4CKI.jpg', 'photo', 960, 1280, 8),
	(1009785393829634048, '1009786518720909312', 'https://pbs.twimg.com/media/DgN6dzKX4AAUsCO.jpg', 'photo', 872, 960, 8),
	(1009750354840317952, '1009758737782001664', 'https://pbs.twimg.com/media/DgNamQwU8AAcR8g.jpg', 'photo', 800, 621, 8),
	(1008188187443912704, '1009591873080627200', 'https://pbs.twimg.com/media/Df3N0JtW4AAWi_G.jpg', 'photo', 2048, 1151, 8),
	(1009441279246262272, '1009511596715061249', 'https://pbs.twimg.com/media/DgJBfscW4AAmXfQ.jpg', 'photo', 1200, 822, 8),
	(1009465871159431171, '1009470480661864448', 'https://pbs.twimg.com/media/DgJX3IdWkAMxHZz.jpg', 'photo', 1080, 1920, 8),
	(1008579798396911616, '1008829966476365824', 'https://pbs.twimg.com/media/Df8x-6MVQAAzyp0.jpg', 'photo', 2048, 945, 8);


--
-- Data for Name: tweet_urls; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tweet_urls" ("id", "url", "expanded_url", "display_url", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(1, 'https://t.co/5m0DjMETki', 'https://gnuboicavalo.bandcamp.com/releases', 'gnuboicavalo.bandcamp.com/releases', '1002676399659012097'),
	(2, 'https://t.co/Wi4yfWIX55', 'https://github.com/open-birdsite-db/open-birdsite-db', 'github.com/open-birdsite-…', '1823445398502994378'),
	(3, 'https://t.co/B7a1YIYy8O', 'https://x.com/settings/download_your_data', 'x.com/settings/downl…', '1823343756101243378'),
	(4, 'https://t.co/8cpVcsyTFT', 'https://twitter.com/rapazamoroso/status/1008811759602462726', 'twitter.com/rapazamoroso/s…', '1008832033546752000'),
	(5, 'https://t.co/6cVtcqQ3X1', 'https://twitter.com/simon_ohler/status/1812928707016757706', 'twitter.com/simon_ohler/st…', '1813859159399702849'),
	(6, 'https://t.co/drDYrW2NuM', 'https://twitter.com/ChuckBaggett/status/1756158852087611680', 'twitter.com/ChuckBaggett/s…', '1756170469466669524');


--
-- Data for Name: user_mentions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_mentions" ("id", "mentioned_user_id", "tweet_id") OVERRIDING SYSTEM VALUE VALUES
	(1, '732980797985148928', '1626922779105759235'),
	(2, '732980797985148928', '1626908498134020098'),
	(3, '990430425825755138', '1626871062343327744'),
	(4, '2587393812', '1626871062343327744'),
	(5, '1248684884790587393', '1626745546156257281'),
	(6, '1460283925', '1626745546156257281'),
	(43, '976267215812034560', '1823634222805864549'),
	(44, '1170064144411897857', '1823634131403583929'),
	(45, '18280363', '1823494196587642985'),
	(46, '1747709313920188416', '1823445398502994378'),
	(47, '1680757426889342977', '1823445398502994378'),
	(48, '752422021', '1823445398502994378'),
	(49, '1362689713', '1823445398502994378'),
	(50, '36223287', '1823416171481235602'),
	(51, '18280363', '1823416171481235602'),
	(52, '1915273423', '1823411111334699182'),
	(53, '585462708', '1823411111334699182'),
	(54, '36223287', '1823404289043091746'),
	(55, '18280363', '1823404289043091746'),
	(56, '820288038', '1823404289043091746'),
	(57, '1730335465398730752', '1823404289043091746'),
	(58, '24761783', '1823404289043091746'),
	(59, '178479745', '1823404289043091746'),
	(60, '191666539', '1823404289043091746'),
	(61, '36223287', '1823403834997113062'),
	(62, '18280363', '1823403834997113062'),
	(63, '820288038', '1823403834997113062'),
	(64, '1730335465398730752', '1823403834997113062'),
	(65, '24761783', '1823403834997113062'),
	(66, '178479745', '1823403834997113062'),
	(67, '191666539', '1823403834997113062'),
	(68, '36223287', '1823403377881145373'),
	(69, '18280363', '1823403377881145373'),
	(70, '820288038', '1823403377881145373'),
	(71, '1730335465398730752', '1823403377881145373'),
	(72, '24761783', '1823403377881145373'),
	(73, '178479745', '1823403377881145373'),
	(74, '191666539', '1823403377881145373'),
	(75, '36223287', '1823402655751840102'),
	(76, '18280363', '1823402655751840102'),
	(77, '36223287', '1823388793677795589'),
	(78, '18280363', '1823388793677795589'),
	(79, '36223287', '1823388585807970739'),
	(80, '18280363', '1823388585807970739'),
	(81, '1389683959412396032', '1823379563721662810'),
	(82, '973083181640335360', '1823379563721662810'),
	(83, '1389683959412396032', '1823379265825407334'),
	(84, '973083181640335360', '1823379265825407334'),
	(85, '585462708', '1823378807111213369'),
	(86, '585462708', '1823378703193113048'),
	(87, '585462708', '1823378044418998342'),
	(88, '973083181640335360', '1823377858527375409'),
	(89, '1389683959412396032', '1823377858527375409'),
	(90, '1747709313920188416', '1823376748882395372'),
	(91, '1680757426889342977', '1823376748882395372'),
	(92, '752422021', '1823376748882395372'),
	(93, '1362689713', '1823376748882395372'),
	(94, '585462708', '1823376636487569722'),
	(95, '585462708', '1823371512516051341'),
	(96, '116624142', '1823371099331043613'),
	(97, '1680757426889342977', '1823371099331043613'),
	(98, '752422021', '1823371099331043613'),
	(99, '1362689713', '1823371099331043613'),
	(100, '973083181640335360', '1823369671677993267'),
	(101, '973083181640335360', '1823369575313887291'),
	(102, '1680757426889342977', '1823344256934719999'),
	(103, '752422021', '1823344256934719999'),
	(104, '1362689713', '1823344256934719999'),
	(105, '18280363', '1823332670908105026'),
	(106, '1594947702181199872', '1823061202550816882'),
	(107, '1165044870362189824', '1822951295336038785'),
	(108, '1283792798886408192', '1822743481581703396'),
	(109, '948342296751296512', '1822697964004884927'),
	(110, '1915273423', '1814656545872818663'),
	(111, '56285139', '1814409585144275438'),
	(112, '902520345651007488', '1814330871022759942'),
	(113, '1428510394960732161', '1814329297231909376'),
	(114, '585462708', '1814329151328821533'),
	(115, '1796120648281923584', '1814325347694882894'),
	(116, '1915273423', '1814325308792635752'),
	(117, '1163927704049262592', '1814310482741703003'),
	(118, '804213003197546496', '1814241187156353420'),
	(119, '1181349398283993089', '1814062601283719303'),
	(120, '1044604087013015552', '1814055988879642788'),
	(121, '1447586566071783432', '1814055988879642788'),
	(122, '282948199', '1814049883927502946'),
	(123, '1915273423', '1813701956986458362'),
	(124, '163384337', '1813697117829079336'),
	(125, '819427188', '1757477291909857694'),
	(126, '819427188', '1757477175060742246'),
	(127, '1278573670739464192', '1757264787778777139'),
	(128, '1278573670739464192', '1757264719000568201'),
	(129, '1163743742764998658', '1756482501575647247'),
	(130, '1163743742764998658', '1756482491651903973'),
	(131, '1283792798886408192', '1756471209573949478'),
	(132, '585462708', '1756366546321203508'),
	(133, '193553265', '1756220446649745665'),
	(134, '820288038', '1756206339087270107'),
	(135, '18280363', '1756206339087270107'),
	(136, '1392773380449857537', '1756091117093974494'),
	(137, '1915273423', '1756090582769046014'),
	(138, '1600646881734184960', '1755622932787982609'),
	(139, '1223231444429856769', '1755622932787982609'),
	(140, '1346407778647212032', '1755426879832743972'),
	(141, '1346407778647212032', '1755406989323321856'),
	(142, '820288038', '1755369442987667766');



--
-- Name: archive_upload_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."archive_upload_id_seq"', 8, true);


--
-- Name: followers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."followers_id_seq"', 3314, true);


--
-- Name: following_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."following_id_seq"', 1435, true);


--
-- Name: likes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."likes_id_seq"', 156247, true);


--
-- Name: profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."profile_id_seq"', 8, true);


--
-- Name: tweet_urls_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."tweet_urls_id_seq"', 3402, true);


--
-- Name: user_mentions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"dev"."user_mentions_id_seq"', 23275, true);
