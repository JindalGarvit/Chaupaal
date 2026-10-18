/**
 * Profile facts — short lines for profile-completion celebrations.
 *
 * Interface: getProfileFact(fieldName, value) → Promise<{ line, trivia?, unlockHint?, source, ... }>
 *
 * Providers:
 *  - generic (ACTIVE): warm copy + static trivia banks (zero query cost). Never invents live counts.
 *  - Display stats (P2): profile UI uses resolveHonestProfileStats from denormalized fields —
 *    celebrations stay generic so we never invent “X people share this.”
 *
 * Trivia is hardcoded per value/category and randomly rotated. Obscure values
 * fall back to warm-only copy — never invent dull filler "facts."
 */
(function () {
  /** Celebrations stay generic; display stats are honest via resolveHonestProfileStats (P2). */
  const PROFILE_FACTS_USE_REAL_STATS = false;

  const MATCHING_FIELDS = new Set([
    'currentCity',
    'bio',
    'hobbies',
    'languages',
    'occupation',
    'lifeGoals',
    'photos',
    'displayName',
  ]);

  /** Warm primary lines (friend-cheering voice). */
  const GENERIC = {
    displayName: (v) => t('profile.fact_hey_name', { name: String(v).split(' ')[0] }),
    bio: () => t('profile.bio_s_in_now_people_actually'),
    dateOfBirth: () => t('profile.birthday_saved_we_ll_remember_cake'),
    gender: () => t('profile.got_it_makes_it_easier_to'),
    currentCity: (v) =>
      v ? t('profile.fact_city_nice', { city: v }) : t('profile.city_s_in_easier_to_find'),
    occupation: (v) =>
      v ? t('profile.fact_occupation_nice', { occupation: v }) : t('profile.work_life_s_in_you_ll'),
    highestEducation: () => t('profile.education_noted_quiet_little_detail_but'),
    education: () => t('profile.education_noted_quiet_little_detail_but'),
    relationshipStatus: () => t('profile.got_it_clears_up_any_confusion'),
    diet: () => t('profile.diet_preference_saved_small_detail_big'),
    hobbies: (v) => {
      const list = Array.isArray(v) ? v.slice(0, 2).join(' & ') : String(v || 'those');
      return `${list}? Love that. You'll find people into the same stuff.`;
    },
    lifeGoals: () => t('profile.goals_down_nice_to_know_what'),
    dreams: () => t('profile.goals_down_nice_to_know_what'),
    mbti: (v) => {
      const t = String(v || '').toUpperCase();
      if (!t || t === "DON'T KNOW" || t === 'DONT KNOW') return t('profile.personality_noted_helps_people_get_your');
      return `${t} — fun. Helps people get your vibe faster.`;
    },
    languages: (v) => {
      const list = Array.isArray(v) ? v.slice(0, 2).join(' + ') : String(v || 'those');
      return `${list}. Always nicer when you can just talk.`;
    },
    photos: () => t('profile.photo_s_up_so_much_better'),
    photoURL: () => t('profile.photo_s_up_so_much_better'),
    family: () => t('profile.family_bit_added_makes_chats_feel'),
    lookingFor: () => t('profile.got_what_you_re_looking_for'),
    prompts: () => t('profile.prompts_in_instant_icebreaker_energy'),
    icebreakers: () => t('profile.icebreakers_in_chats_just_got_easier'),
    industry: () => t('profile.industry_noted_you_ll_bump_into'),
    username: (v) => (v ? `@${String(v).replace(/^@/, '')} is yours.` : t('profile.username_s_set')),
    identity: () => t('profile.identity_s_looking_like_you_photo'),
    social: () => t('profile.social_s_filled_in_city_languages'),
    relationship: () => t('profile.relationship_bits_are_in_clear_no'),
    career: () => t('profile.career_s_on_the_profile_work'),
    trust: () => t('profile.trust_checks_out_handle_face_verified'),
  };

  const SECTION_FACTS = /* i18n-copy */ {
    identity: [
      t('profile.profiles_with_a_photo_and_a'),
      t('profile.a_couple_of_prompts_beat_a'),
    ],
    social: [
      t('profile.city_languages_is_how_people_find'),
      t('profile.shared_hobbies_are_the_original_icebreaker'),
    ],
    relationship: [
      t('profile.clear_status_saves_everyone_an_awkward'),
      t('profile.intent_on_the_profile_is_optional'),
    ],
    career: [
      t('profile.occupation_is_a_shortcut_to_oh'),
      t('profile.work_stuff_on_a_profile_is'),
    ],
    trust: [
      t('profile.a_real_photo_a_verified_contact'),
      t('profile.username_s_yours_that_s_the'),
    ],
  };

  const UNLOCK_HINTS = {
    currentCity: t('profile.you_ll_see_more_people_nearby'),
    bio: t('profile.peepal_can_actually_introduce_you_properly'),
    hobbies: t('profile.more_people_who_get_your_interests'),
    languages: t('profile.easier_to_match_with_people_you'),
    occupation: t('profile.more_people_from_worlds_like_yours'),
    lifeGoals: t('profile.you_ll_bump_into_people_chasing'),
    dreams: t('profile.you_ll_bump_into_people_chasing'),
    photos: t('profile.you_show_up_as_a_real'),
    displayName: t('profile.people_can_finally_put_a_name'),
  };

  // ---------- Static trivia banks (rotate randomly) ----------
  const MBTI_TRIVIA = /* i18n-copy */ {
    INTJ: [
      t('profile.intjs_are_sometimes_called_the_architects'),
      t('profile.fun_intj_lore_they_often_have'),
      t('profile.intjs_make_up_a_small_slice'),
      t('profile.classic_intj_move_saying_little_noticing'),
    ],
    INTP: [
      t('profile.intps_are_the_logicians_curious_about'),
      t('profile.intp_energy_starting_five_deep_dives'),
      t('profile.fun_intp_fact_they_can_debate'),
      t('profile.intps_often_invent_nicknames_for_systems'),
    ],
    ENTJ: [
      t('profile.entjs_are_the_commanders_allergic_to'),
      t('profile.entj_vibe_what_s_the_goal'),
      t('profile.fun_entj_fact_they_treat_group'),
      t('profile.entjs_often_become_the_unofficial_captain'),
    ],
    ENTP: [
      t('profile.entps_are_the_debaters_they_ll'),
      t('profile.fun_entp_fact_they_collect_ideas'),
      t('profile.entp_energy_what_if_we_tried'),
      t('profile.entps_are_famous_for_inventing_plans'),
    ],
    INFJ: [
      t('profile.infjs_are_the_rarest_type_in'),
      t('profile.infj_lore_they_often_know_how'),
      t('profile.fun_infj_fact_they_keep_mental'),
      t('profile.infjs_are_sometimes_called_the_advocates'),
    ],
    INFP: [
      t('profile.infps_are_the_mediators_soft_hearts'),
      t('profile.fun_infp_fact_they_can_turn'),
      t('profile.infp_energy_playlists_that_feel_like'),
      t('profile.infps_often_write_better_in_notes'),
    ],
    ENFJ: [
      t('profile.enfjs_are_the_protagonists_the_friend'),
      t('profile.fun_enfj_fact_they_host_gatherings'),
      t('profile.enfj_vibe_you_ve_got_this'),
      t('profile.enfjs_often_become_the_glue_of'),
    ],
    ENFP: [
      t('profile.enfps_are_the_campaigners_spark_plugs'),
      t('profile.fun_enfp_fact_they_can_make'),
      t('profile.enfp_energy_twelve_tabs_open_all'),
      t('profile.enfps_collect_people_hobbies_and_midnight'),
    ],
    ISTJ: [
      t('profile.istjs_are_the_logisticians_reliable_as'),
      t('profile.fun_istj_fact_they_often_have'),
      t('profile.istj_vibe_doing_the_right_thing'),
      t('profile.istjs_keep_traditions_alive_that_everyone'),
    ],
    ISFJ: [
      t('profile.isfjs_are_the_defenders_the_ones'),
      t('profile.fun_isfj_fact_they_remember_how'),
      t('profile.isfj_energy_caring_in_practical_ways'),
      t('profile.isfjs_often_hold_friend_groups_together'),
    ],
    ESTJ: [
      t('profile.estjs_are_the_executives_agendas_follow'),
      t('profile.fun_estj_fact_they_can_turn'),
      t('profile.estj_vibe_let_s_just_decide'),
      t('profile.estjs_are_often_the_first_to'),
    ],
    ESFJ: [
      t('profile.esfjs_are_the_consuls_hosts_at'),
      t('profile.fun_esfj_fact_they_notice_who'),
      t('profile.esfj_energy_group_photos_group_chats'),
      t('profile.esfjs_make_you_re_invited_feel'),
    ],
    ISTP: [
      t('profile.istps_are_the_virtuosos_fixers_tinkerers'),
      t('profile.fun_istp_fact_they_often_learn'),
      t('profile.istp_vibe_few_words_excellent_timing'),
      t('profile.istps_can_make_a_problem_look'),
    ],
    ISFP: [
      t('profile.isfps_are_the_adventurers_aesthetic_eyes'),
      t('profile.fun_isfp_fact_they_notice_textures'),
      t('profile.isfp_energy_living_in_the_moment'),
      t('profile.isfps_often_express_feelings_better_throug'),
    ],
    ESTP: [
      t('profile.estps_are_the_entrepreneurs_action_first'),
      t('profile.fun_estp_fact_they_turn_ordinary'),
      t('profile.estp_vibe_jump_in_figure_it'),
      t('profile.estps_keep_rooms_awake_in_the'),
    ],
    ESFP: [
      t('profile.esfps_are_the_entertainers_warm_spotlight'),
      t('profile.fun_esfp_fact_they_can_make'),
      t('profile.esfp_vibe_why_not_followed_by'),
      t('profile.esfps_collect_moments_not_manuals'),
    ],
  };

  const LANGUAGE_TRIVIA = /* i18n-copy */ {
    Hindi: [
      t('profile.hindi_shares_roots_with_sanskrit_and'),
      t('profile.fun_hindi_fact_namaste_literally_bows'),
      t('profile.hindi_is_one_of_the_most'),
      t('profile.bollywood_helped_hindi_travel_farther_than'),
    ],
    English: [
      t('profile.english_steals_words_from_everywhere_inclu'),
      t('profile.fun_english_fact_shampoo_and_bungalow'),
      t('profile.english_spelling_is_chaotic_because_it'),
      t('profile.more_people_speak_english_as_a'),
    ],
    Tamil: [
      t('profile.tamil_is_one_of_the_world'),
      t('profile.fun_tamil_fact_sangam_poetry_was'),
      t('profile.tamil_has_a_unbroken_literary_tradition'),
      t('profile.tamil_cinema_and_literature_keep_inventing'),
    ],
    Telugu: [
      t('profile.telugu_is_often_called_the_italian'),
      t('profile.fun_telugu_fact_it_s_one'),
      t('profile.telugu_film_music_has_exported_catchy'),
      t('profile.classical_telugu_poetry_loves_long_flowing'),
    ],
    Marathi: [
      t('profile.marathi_has_a_proud_literary_scene'),
      t('profile.fun_marathi_fact_pune_s_book'),
      t('profile.marathi_theatre_natak_has_been_packing'),
      t('profile.jai_maharashtra_hits_different_when_you'),
    ],
    Bengali: [
      t('profile.bengali_gave_the_world_tagore_and'),
      t('profile.fun_bengali_fact_kolkata_once_printed'),
      t('profile.bengali_new_year_poila_boishakh_is'),
      t('profile.the_language_loves_long_lyrical_sentences'),
    ],
    Gujarati: [
      t('profile.gujarati_traders_helped_carry_the_language'),
      t('profile.fun_gujarati_fact_it_s_the'),
      t('profile.garba_nights_make_gujarati_feel_like'),
      t('profile.gujarati_has_a_rich_jain_and'),
    ],
    Kannada: [
      t('profile.kannada_has_classical_status_and_a'),
      t('profile.fun_kannada_fact_inscriptions_in_kannada'),
      t('profile.bengaluru_s_tech_boom_made_kannada'),
      t('profile.kannada_poetry_can_be_as_soft'),
    ],
    Malayalam: [
      t('profile.malayalam_script_is_famous_for_its'),
      t('profile.fun_malayalam_fact_kerala_s_literacy'),
      t('profile.mollywood_keeps_surprising_people_who_only'),
      t('profile.malayalam_has_a_knack_for_long'),
    ],
    Punjabi: [
      t('profile.punjabi_is_the_beat_behind_countless'),
      t('profile.fun_punjabi_fact_it_s_tonal'),
      t('profile.from_bhangra_to_sufi_punjabi_music'),
      t('profile.punjabi_hospitality_lore_guests_leave_full'),
    ],
    Urdu: [
      t('profile.urdu_poetry_shayari_can_break_your'),
      t('profile.fun_urdu_fact_it_shares_so'),
      t('profile.the_word_urdu_itself_relates_to'),
      t('profile.ghazals_made_urdu_feel_like_velvet'),
    ],
    Odia: [
      t('profile.odia_oriya_has_classical_language_status'),
      t('profile.fun_odia_fact_jagannath_culture_shaped'),
      t('profile.odia_literature_has_a_quiet_depth'),
      t('profile.puri_s_temple_kitchen_lore_is'),
    ],
    Assamese: [
      t('profile.assamese_is_the_glue_of_the'),
      t('profile.fun_assamese_fact_bihu_songs_can'),
      t('profile.assamese_has_unique_sounds_you_won'),
      t('profile.tea_country_mornings_and_assamese_go'),
    ],
    Konkani: [
      t('profile.konkani_rides_the_coast_goa_to'),
      t('profile.fun_konkani_fact_it_s_written'),
      t('profile.konkani_songs_and_fish_curry_debates'),
      t('profile.despite_its_smaller_speaker_base_konkani'),
    ],
  };

  const CITY_TRIVIA = /* i18n-copy */ {
    mumbai: [
      t('profile.mumbai_s_local_trains_move_more'),
      t('profile.fun_mumbai_fact_the_city_s'),
      t('profile.marine_drive_s_curve_is_nicknamed'),
      t('profile.mumbai_fits_islands_film_sets_and'),
    ],
    delhi: [
      t('profile.delhi_has_been_rebuilt_so_many'),
      t('profile.fun_delhi_fact_you_can_eat'),
      t('profile.the_metro_made_the_city_feel'),
      t('profile.old_delhi_s_lanes_still_smell'),
    ],
    'new delhi': [
      t('profile.new_delhi_was_planned_as_a'),
      t('profile.fun_fact_india_gate_has_been'),
      t('profile.lutyens_bungalows_and_neon_market_alleys'),
      t('profile.new_delhi_winters_turn_every_rooftop'),
    ],
    bengaluru: [
      t('profile.bengaluru_s_nickname_garden_city_still'),
      t('profile.fun_bengaluru_fact_it_s_one'),
      t('profile.the_weather_joke_writes_itself_sweater'),
      t('profile.pub_culture_tech_culture_weekend_plans'),
    ],
    bangalore: [
      t('profile.bangalore_bengaluru_same_city_endless_nami'),
      t('profile.fun_fact_cubbon_park_is_the'),
      t('profile.startup_energy_here_is_matched_only'),
      t('profile.once_famous_for_gardens_now_famous'),
    ],
    hyderabad: [
      t('profile.hyderabad_s_biryani_arguments_are_a'),
      t('profile.fun_hyderabad_fact_charminar_has_been'),
      t('profile.pearl_city_lore_gems_diamonds_and'),
      t('profile.hitec_city_and_old_city_somehow'),
    ],
    chennai: [
      t('profile.chennai_invented_the_idea_of_filter'),
      t('profile.fun_chennai_fact_marina_beach_is'),
      t('profile.tamil_cinema_s_heartbeat_still_thumps'),
      t('profile.from_sabhas_to_seaside_walks_december'),
    ],
    kolkata: [
      t('profile.kolkata_s_adda_culture_treats_conversation'),
      t('profile.fun_kolkata_fact_the_howrah_bridge'),
      t('profile.rosogolla_diplomacy_has_settled_many_famil'),
      t('profile.trams_book_stalls_and_durga_puja'),
    ],
    pune: [
      t('profile.pune_mixes_student_energy_it_parks'),
      t('profile.fun_pune_fact_it_s_long'),
      t('profile.misal_pav_opinions_here_are_taken'),
      t('profile.weekend_sahyadri_escapes_are_basically_a'),
    ],
    ahmedabad: [
      t('profile.ahmedabad_s_old_city_pols_are'),
      t('profile.fun_ahmedabad_fact_it_was_india'),
      t('profile.sabarmati_evenings_and_street_snacks_undef'),
      t('profile.garba_season_turns_the_whole_city'),
    ],
    jaipur: [
      t('profile.jaipur_s_pink_city_glow_is'),
      t('profile.fun_jaipur_fact_the_hawa_mahal'),
      t('profile.bazaars_here_sell_colour_by_the'),
      t('profile.royal_forts_and_modern_cafes_somehow'),
    ],
    chandigarh: [
      t('profile.chandigarh_is_one_of_india_s'),
      t('profile.fun_chandigarh_fact_the_rock_garden'),
      t('profile.sectors_make_navigation_weirdly_logical_un'),
      t('profile.sukhna_lake_sunsets_are_a_local'),
    ],
    lucknow: [
      t('profile.lucknow_s_tehzeeb_courtesy_is_a'),
      t('profile.fun_lucknow_fact_kebabs_here_have'),
      t('profile.the_city_can_argue_for_hours'),
      t('profile.imambaras_and_modern_malls_share_the'),
    ],
    goa: [
      t('profile.goa_s_coastline_switches_moods_every'),
      t('profile.fun_goa_fact_it_s_india'),
      t('profile.susegad_is_less_laziness_more_intentional'),
      t('profile.from_feni_lore_to_sunset_silhouettes'),
    ],
    kochi: [
      t('profile.kochi_cochin_has_been_a_spice'),
      t('profile.fun_kochi_fact_chinese_fishing_nets'),
      t('profile.backwaters_nearby_make_weekend_plan_an'),
      t('profile.a_port_city_that_somehow_still'),
    ],
    cochin: [
      t('profile.cochin_kochi_spice_history_monsoon_greens'),
      t('profile.fun_fact_fort_kochi_s_streets'),
      t('profile.seafood_here_turns_first_timers_into'),
      t('profile.chinese_fishing_nets_are_the_city'),
    ],
    indore: [
      t('profile.indore_takes_street_food_so_seriously'),
      t('profile.fun_indore_fact_it_s_topped'),
      t('profile.sarafa_nights_are_a_food_pilgrimage'),
      t('profile.the_city_mixes_business_hustle_with'),
    ],
    nagpur: [
      t('profile.nagpur_sits_near_india_s_geographic'),
      t('profile.fun_nagpur_fact_the_zero_mile'),
      t('profile.winter_oranges_here_taste_like_the'),
      t('profile.a_calm_city_energy_with_a'),
    ],
    surat: [
      t('profile.surat_is_a_diamond_and_textile'),
      t('profile.fun_surat_fact_it_rebuilt_itself'),
      t('profile.undhiyu_season_is_non_negotiable_for'),
      t('profile.business_hustle_gujarati_hospitality_surat'),
    ],
    bhopal: [
      t('profile.bhopal_s_lakes_give_it_a'),
      t('profile.fun_bhopal_fact_it_s_often'),
      t('profile.upper_and_lower_lake_sunsets_do'),
      t('profile.a_capital_city_that_still_feels'),
    ],
    patna: [
      t('profile.patna_sits_on_history_ancient_pataliputra'),
      t('profile.fun_patna_fact_the_ganga_here'),
      t('profile.litti_chokha_loyalty_is_undefeated'),
      t('profile.a_riverside_capital_with_stories_older'),
    ],
    thiruvananthapuram: [
      t('profile.thiruvananthapuram_trivandrum_mixes_temple'),
      t('profile.fun_fact_it_s_kerala_s'),
      t('profile.padmanabhaswamy_temple_lore_still_draws_qu'),
      t('profile.filter_coffee_sea_breeze_is_an'),
    ],
    trivandrum: [
      t('profile.trivandrum_thiruvananthapuram_capital_calm'),
      t('profile.fun_fact_museum_and_temple_circuits'),
      t('profile.kerala_s_southern_tip_energy_green'),
      t('profile.a_city_that_rewards_people_who'),
    ],
  };

  const ZODIAC_TRIVIA = /* i18n-copy */ {
    Aries: [
      t('profile.aries_season_kicks_off_the_zodiac'),
      t('profile.fun_aries_fact_ruled_by_mars'),
      t('profile.aries_vibe_why_wait_as_a'),
      t('profile.ram_symbolism_headfirst_heart_open_eventua'),
    ],
    Taurus: [
      t('profile.taurus_season_is_peak_slow_luxury'),
      t('profile.fun_taurus_fact_venus_ruled_in'),
      t('profile.taurus_energy_stubborn_about_the_important'),
      t('profile.bull_symbolism_steady_progress_beats_flash'),
    ],
    Gemini: [
      t('profile.gemini_season_loves_banter_tabs_and'),
      t('profile.fun_gemini_fact_the_twins_motif'),
      t('profile.gemini_vibe_curiosity_as_a_renewable'),
      t('profile.mercury_ruled_lore_words_are_their'),
    ],
    Cancer: [
      t('profile.cancer_season_is_soft_armour_protective'),
      t('profile.fun_cancer_fact_moon_ruled_in'),
      t('profile.cancer_energy_home_is_a_feeling'),
      t('profile.crab_symbolism_tough_shell_tender_centre'),
    ],
    Leo: [
      t('profile.leo_season_understands_main_character_ligh'),
      t('profile.fun_leo_fact_sun_ruled_warmth'),
      t('profile.leo_vibe_celebrate_people_including_yourse'),
      t('profile.lion_symbolism_loyalty_with_a_roar'),
    ],
    Virgo: [
      t('profile.virgo_season_notices_the_detail_everyone'),
      t('profile.fun_virgo_fact_harvest_lore_sorting'),
      t('profile.virgo_energy_care_shown_through_competence'),
      t('profile.they_ll_fix_your_itinerary_and'),
    ],
    Libra: [
      t('profile.libra_season_wants_fairness_beauty_and'),
      t('profile.fun_libra_fact_scales_symbolism_balance'),
      t('profile.libra_vibe_what_do_you_think'),
      t('profile.venus_ruled_lore_harmony_over_chaos'),
    ],
    Scorpio: [
      t('profile.scorpio_season_goes_deep_or_goes'),
      t('profile.fun_scorpio_fact_transformation_lore_endin'),
      t('profile.scorpio_vibe_intensity_with_a_private'),
      t('profile.they_remember_the_subplot_you_thought'),
    ],
    Sagittarius: [
      t('profile.sagittarius_season_packs_bags_literal_or'),
      t('profile.fun_sagittarius_fact_archer_symbolism_aim'),
      t('profile.sag_energy_honesty_that_somehow_still'),
      t('profile.they_collect_philosophies_like_travel_stic'),
    ],
    Capricorn: [
      t('profile.capricorn_season_climbs_quietly_and_arrive'),
      t('profile.fun_capricorn_fact_sea_goat_lore'),
      t('profile.cap_energy_long_games_dry_humour'),
      t('profile.they_treat_goals_like_mountains_one'),
    ],
    Aquarius: [
      t('profile.aquarius_season_invents_the_group_chat'),
      t('profile.fun_aquarius_fact_water_bearer_lore'),
      t('profile.aqua_vibe_friendly_from_a_slightly'),
      t('profile.they_ll_care_about_people_and'),
    ],
    Pisces: [
      t('profile.pisces_season_blurs_edges_dreams_music'),
      t('profile.fun_pisces_fact_two_fish_swimming'),
      t('profile.pisces_vibe_intuition_first_spreadsheet_la'),
      t('profile.they_turn_ordinary_evenings_into_little'),
    ],
  };

  /** Occupation free-text → category keyword banks. */
  const OCCUPATION_TRIVIA = /* i18n-copy */ {
    engineer: [
      t('profile.engineers_professional_problem_solvers_who'),
      t('profile.fun_engg_fact_it_works_on'),
      t('profile.india_graduates_a_huge_wave_of'),
      t('profile.engineers_turn_constraints_into_clever_wor'),
    ],
    developer: [
      t('profile.developers_ship_invisible_cities_made_of'),
      t('profile.fun_dev_fact_rubber_duck_debugging'),
      t('profile.dark_mode_is_less_aesthetic_more'),
      t('profile.commit_messages_can_be_poetry_if'),
    ],
    designer: [
      t('profile.designers_see_spacing_the_way_musicians'),
      t('profile.fun_design_fact_people_notice_bad'),
      t('profile.a_good_designer_makes_hard_things'),
      t('profile.moodboards_are_basically_emotional_researc'),
    ],
    doctor: [
      t('profile.doctors_collect_stories_and_stamina_in'),
      t('profile.fun_medicine_fact_the_white_coat'),
      t('profile.night_shifts_forge_a_special_kind'),
      t('profile.they_translate_scary_words_into_human'),
    ],
    teacher: [
      t('profile.teachers_plant_questions_that_bloom_years'),
      t('profile.fun_teaching_fact_explaining_something_is'),
      t('profile.a_great_teacher_remembers_who_you'),
      t('profile.chalk_dust_is_basically_glitter_for'),
    ],
    student: [
      t('profile.student_life_deadlines_chai_and_sudden'),
      t('profile.fun_student_fact_the_best_notes'),
      t('profile.exam_season_turns_libraries_into_temporary'),
      t('profile.you_re_collecting_futures_in_parallel'),
    ],
    founder: [
      t('profile.founders_live_in_optimism_with_a'),
      t('profile.fun_startup_fact_most_origin_stories'),
      t('profile.pitch_decks_are_modern_campfire_stories'),
      t('profile.they_learn_in_public_bruise_in'),
    ],
    lawyer: [
      t('profile.lawyers_argue_for_a_living_and'),
      t('profile.fun_law_fact_objection_is_peak'),
      t('profile.fine_print_is_their_native_habitat'),
      t('profile.they_turn_messy_human_stories_into'),
    ],
    writer: [
      t('profile.writers_notice_the_sentence_hiding_inside'),
      t('profile.fun_writing_fact_drafts_are_where'),
      t('profile.a_blank_page_is_both_enemy'),
      t('profile.they_collect_phrases_like_other_people'),
    ],
    finance: [
      t('profile.finance_folks_see_patterns_in_numbers'),
      t('profile.fun_finance_fact_compound_interest_is'),
      t('profile.markets_mood_swing_good_analysts_stay'),
      t('profile.they_translate_risk_into_decisions_people'),
    ],
    marketing: [
      t('profile.marketers_turn_attention_into_stories_peop'),
      t('profile.fun_marketing_fact_the_best_campaigns'),
      t('profile.they_a_b_test_reality_for'),
      t('profile.taglines_are_tiny_poems_with_a'),
    ],
    consultant: [
      t('profile.consultants_ask_the_questions_everyone_was'),
      t('profile.fun_consulting_fact_frameworks_are_just'),
      t('profile.slide_decks_are_their_hiking_gear'),
      t('profile.they_borrow_brains_across_industries_and'),
    ],
    artist: [
      t('profile.artists_make_feelings_visible_on_walls'),
      t('profile.fun_art_fact_unfinished_pieces_often'),
      t('profile.they_notice_colour_temperature_the_way'),
      t('profile.a_sketchbook_is_a_portable_universe'),
    ],
    chef: [
      t('profile.chefs_turn_heat_and_timing_into'),
      t('profile.fun_food_fact_salt_is_the'),
      t('profile.kitchen_rush_hour_is_a_choreography'),
      t('profile.they_feed_people_and_somehow_feed'),
    ],
  };

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function zodiacFromDate(value) {
    if (!value) return null;
    let d = null;
    if (value instanceof Date) d = value;
    else if (typeof value === 'string') {
      // Accept YYYY-MM-DD or similar
      const m = value.match(/(\d{4})-(\d{2})-(\d{2})/) || value.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m && m[0].includes('-') && m[1].length === 4) d = new Date(+m[1], +m[2] - 1, +m[3]);
      else if (m) {
        const day = +m[1];
        const mon = +m[2];
        let year = +m[3];
        if (year < 100) year += 2000;
        // If first number > 12, assume DMY
        if (day > 12) d = new Date(year, mon - 1, day);
        else d = new Date(year, day - 1, mon); // ambiguous — prefer ISO path above
      } else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) d = parsed;
      }
    }
    if (!d || Number.isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.getMonth() + 1;
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Pisces';
    return null;
  }

  function occupationCategory(value) {
    const s = norm(value);
    if (!s) return null;
    const rules = [
      ['engineer', /engineer|engg|iit|nit|mechanical|civil|electrical|electronics/],
      ['developer', /develop|software|programmer|sde|full.?stack|frontend|backend|coder|devops/],
      ['designer', /design|ux|ui|figma|graphic|product design/],
      ['doctor', /doctor|physician|surgeon|mbbs|md\b|medical|nurse|dentist/],
      ['teacher', /teach|professor|lecturer|tutor|educator|faculty/],
      ['student', /student|undergrad|postgrad|mba candidate|fresher|college/],
      ['founder', /founder|co-?founder|startup|entrepreneur/],
      ['lawyer', /lawyer|advocate|attorney|legal|counsel/],
      ['writer', /writer|author|journalist|editor|content/],
      ['finance', /finance|analyst|accountant|ca\b|cfa|banker|investment/],
      ['marketing', /market|brand|growth|seo|social media/],
      ['consultant', /consult/],
      ['artist', /artist|painter|musician|actor|filmmaker|photographer/],
      ['chef', /chef|cook|baker|culin/],
    ];
    for (const [cat, re] of rules) {
      if (re.test(s)) return cat;
    }
    return null;
  }

  function triviaFor(fieldName, value) {
    if (fieldName === 'mbti') {
      const t = String(value || '').toUpperCase().trim();
      if (!t || t.includes('DON') || t.includes('KNOW')) return null;
      return pick(MBTI_TRIVIA[t] || null);
    }
    if (fieldName === 'languages') {
      const list = Array.isArray(value) ? value : [value];
      // Prefer trivia for the newly relevant / first language with a bank
      for (const lang of list) {
        const key = Object.keys(LANGUAGE_TRIVIA).find((k) => norm(k) === norm(lang));
        if (key) return pick(LANGUAGE_TRIVIA[key]);
      }
      return null;
    }
    if (fieldName === 'currentCity') {
      const n = norm(value);
      if (!n) return null;
      // Exact or contains known city key
      for (const [key, facts] of Object.entries(CITY_TRIVIA)) {
        if (n === key || n.includes(key) || key.includes(n)) return pick(facts);
      }
      return null;
    }
    if (fieldName === 'dateOfBirth') {
      const z = zodiacFromDate(value);
      if (!z) return null;
      const fact = pick(ZODIAC_TRIVIA[z]);
      return fact ? `${z}: ${fact}` : null;
    }
    if (fieldName === 'occupation') {
      const cat = occupationCategory(value);
      if (!cat) return null;
      return pick(OCCUPATION_TRIVIA[cat]);
    }
    return null;
  }

  function formatValueSnippet(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.slice(0, 3).join(', ');
    return String(value);
  }

  async function genericProvider(fieldName, value) {
    const key = String(fieldName || '');
    const fn = GENERIC[key];
    const line = fn
      ? fn(value)
      : t('profile.saved_little_by_little_this_place');
    const trivia = triviaFor(key, value);
    const unlockHint = MATCHING_FIELDS.has(key) ? UNLOCK_HINTS[key] || null : null;
    return {
      line,
      trivia: trivia || null,
      source: 'generic',
      unlockHint,
      field: key,
      valueSnippet: formatValueSnippet(value),
    };
  }

  async function realStatsProvider(fieldName, value) {
    if (!db) return genericProvider(fieldName, value);
    try {
      return {
        line: await Promise.resolve(
          t('profile.fact_live_stats', { value: formatValueSnippet(value) || fieldName })
        ),
        trivia: null,
        source: 'realStats',
        unlockHint: MATCHING_FIELDS.has(fieldName) ? UNLOCK_HINTS[fieldName] || null : null,
        field: fieldName,
        valueSnippet: formatValueSnippet(value),
        stub: true,
      };
    } catch (e) {
      return genericProvider(fieldName, value);
    }
  }

  async function getProfileFact(fieldName, value) {
    let base;
    if (PROFILE_FACTS_USE_REAL_STATS) {
      try {
        base = await realStatsProvider(fieldName, value);
      } catch (e) {
        base = await genericProvider(fieldName, value);
      }
    } else {
      base = await genericProvider(fieldName, value);
    }
    // Optional cheap AI garnish — never blocks; falls back to client banks
    try {
      const aiOn =
        typeof isAiFeaturesEnabledSync === 'function' ? isAiFeaturesEnabledSync() : false;
      if (
        aiOn &&
        typeof callAI === 'function' &&
        value != null &&
        value !== '' &&
        !(typeof Quiet !== 'undefined' && Quiet?.motion === false)
      ) {
        const snippet = formatValueSnippet(value).slice(0, 80);
        const prompt = t('profile.one_short_fun_world_trivia_fact', { fieldName, snippet });
        const ai = await Promise.race([
          callAI({
            tier: 'fast',
            max_tokens: 60,
            feature: 'profile_fact_trivia',
            messages: [{ role: 'user', content: prompt }],
            lang: typeof aiUiLang === 'function' ? aiUiLang() : undefined,
          }).catch(() => null),
          new Promise((r) => setTimeout(() => r(null), 1200)),
        ]);
        const line = typeof ai === 'string' ? ai : ai?.text || ai?.reply || '';
        if (line && String(line).trim().length > 8) {
          base = { ...base, trivia: String(line).trim().slice(0, 160), source: base.source + '+ai' };
        }
      }
    } catch (e) {
      /* keep client bank */
    }
    return base;
  }

  async function getSectionCompleteFact(sectionId) {
    const id = String(sectionId || '');
    const lineFn = GENERIC[id];
    const line = lineFn ? lineFn() : t('profile.nice_that_part_of_your_profile');
    return {
      line,
      trivia: pick(SECTION_FACTS[id] || null),
      source: 'generic',
      field: id,
    };
  }

  window.PROFILE_FACTS_USE_REAL_STATS = PROFILE_FACTS_USE_REAL_STATS;
  window.getProfileFact = getProfileFact;
  window.getSectionCompleteFact = getSectionCompleteFact;
  window.profileFactsGenericProvider = genericProvider;
  window.profileFactsRealStatsProvider = realStatsProvider;
})();
