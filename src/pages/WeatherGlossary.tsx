import { useState, useMemo } from "react";
import { BookOpen, Search } from "lucide-react";

const GLOSSARY_TERMS = [
  // Instability
  { term: "CAPE", full: "Convective Available Potential Energy", category: "Instability", desc: "A measure of the amount of energy available for convection. Higher values (>2000 J/kg) indicate greater potential for severe thunderstorms. Values >4000 J/kg are considered very high and can support violent tornadoes and large hail.", unit: "J/kg" },
  { term: "CIN", full: "Convective Inhibition", category: "Instability", desc: "Energy needed to initiate convection. Acts as a 'cap' — a moderate CIN (50-200 J/kg) can suppress storms until forcings overcome it, then releasing large CAPE explosively. Very low CIN (<25 J/kg) means storms fire easily; very high CIN (>300) suppresses all convection.", unit: "J/kg" },
  { term: "LI", full: "Lifted Index", category: "Instability", desc: "Compares the temperature of a surface parcel lifted to 500hPa vs. the actual 500hPa temperature. Negative values (<-2) indicate instability; below -6 is very unstable and supports severe thunderstorms. Positive values indicate stable air.", unit: "°C" },
  { term: "K-Index", full: "K-Index", category: "Instability", desc: "A thunderstorm potential index combining the 850-500hPa temperature lapse rate, the 850hPa dew point, and the 700hPa dew point depression. Values >35 indicate a high probability of organized thunderstorms.", unit: "dimensionless" },
  { term: "Total Totals", full: "Total Totals Index", category: "Instability", desc: "A composite instability index (Cross Totals + Vertical Totals). Values >50 suggest thunderstorm potential; >55 severe thunderstorms; >60 tornadoes possible.", unit: "dimensionless" },
  { term: "MUCAPE", full: "Most Unstable CAPE", category: "Instability", desc: "CAPE calculated from the most unstable parcel in the lowest 300 hPa. Better than surface CAPE in elevated convection scenarios or when a capping inversion exists above the surface layer.", unit: "J/kg" },
  { term: "MLCAPE", full: "Mixed-Layer CAPE", category: "Instability", desc: "CAPE calculated using a parcel representing the average properties of the lowest 100 hPa. More representative of the boundary layer air mass than surface-based CAPE in most situations.", unit: "J/kg" },
  { term: "SBCAPE", full: "Surface-Based CAPE", category: "Instability", desc: "CAPE calculated using actual surface temperature and dewpoint. Most relevant when the surface is the source of storm updraft air; can overestimate instability in nocturnal environments.", unit: "J/kg" },
  { term: "Theta-E", full: "Equivalent Potential Temperature", category: "Instability", desc: "Temperature a parcel would have if all moisture was condensed out adiabatically. Theta-E ridges indicate energy corridors fueling convection. Warm, moist air is characterized by high Theta-E values.", unit: "K" },
  { term: "Lapse Rate", full: "Environmental Lapse Rate", category: "Instability", desc: "The rate at which temperature decreases with altitude. The dry adiabatic lapse rate is 10°C/km. Steep mid-level lapse rates (>7°C/km in 700-500 mb layer) enhance severe weather potential.", unit: "°C/km" },

  // Wind Shear
  { term: "SRH", full: "Storm-Relative Helicity", category: "Wind Shear", desc: "Measures the potential for rotating updrafts in thunderstorms. Values >150 m²/s² suggest potential for tornadoes, >300 is significant, >450 is extreme. Calculated using wind profiles relative to estimated storm motion.", unit: "m²/s²" },
  { term: "0-6km Shear", full: "0-6 Kilometer Bulk Wind Shear", category: "Wind Shear", desc: "The change in wind speed/direction from the surface to 6km altitude. >40 knots favors supercells, >50 knots favors significant severe weather. Critical for storm organization and longevity.", unit: "knots" },
  { term: "0-1km Shear", full: "0-1 Kilometer Bulk Wind Shear", category: "Wind Shear", desc: "Low-level wind shear critical for low-level mesocyclone development and tornado potential. Values >20-25 knots in the 0-1km layer are favorable for significant tornadoes, especially when combined with strong SRH.", unit: "knots" },
  { term: "VWS", full: "Vertical Wind Shear", category: "Wind Shear", desc: "Change in wind with height. Critical for storm organization, longevity, and rotating updraft development. Unidirectional shear favors squall lines; directional shear (veering) favors supercells.", unit: "knots/km" },
  { term: "Hodograph", full: "Hodograph", category: "Wind Shear", desc: "A diagram plotting wind vectors at different altitude levels, connected by a line. The shape of the hodograph reveals the character of vertical wind shear: curved hodographs favor supercells; straight ones favor squall lines.", unit: "knots" },
  { term: "Streamwise Vorticity", full: "Streamwise Vorticity", category: "Wind Shear", desc: "Horizontal vorticity oriented parallel to storm motion. Tilted into the vertical by the storm updraft, it generates the rotating updraft (mesocyclone). High streamwise vorticity favors cyclonic supercell rotation.", unit: "s⁻¹" },
  { term: "0-3km SRH", full: "0-3km Storm-Relative Helicity", category: "Wind Shear", desc: "Effective layer for tornado-producing supercells. Values >150 m²/s² are notable; >300 m²/s² are dangerous. Particularly important for tornado potential when combined with high CAPE.", unit: "m²/s²" },
  { term: "Effective SRH", full: "Effective Layer SRH", category: "Wind Shear", desc: "SRH calculated through the effective inflow layer (where CAPE ≥100 J/kg, CIN ≥-250 J/kg). Better than fixed-layer SRH in elevated convection or strongly capped environments.", unit: "m²/s²" },

  // Composite Parameters
  { term: "EHI", full: "Energy Helicity Index", category: "Composite", desc: "Product of CAPE and SRH divided by 160,000. Values >1 suggest tornado potential, >2 significant tornadoes, >5 violent tornadoes (EF3+). Combines both thermodynamic instability and dynamic potential.", unit: "dimensionless" },
  { term: "STP", full: "Significant Tornado Parameter", category: "Composite", desc: "SPC composite parameter that incorporates CAPE, LCL, SRH, and shear. Values >1 indicate potential for significant (EF2+) tornadoes. A value of 3+ suggests major outbreak potential.", unit: "dimensionless" },
  { term: "SCP", full: "Supercell Composite Parameter", category: "Composite", desc: "Identifies atmospheric environments favorable for supercell thunderstorms. Values >1 suggest supercell potential, >4 significant supercell threat. Computed from MUCAPE, ESRH, and 0-6km shear.", unit: "dimensionless" },
  { term: "SHIP", full: "Significant Hail Parameter", category: "Composite", desc: "A composite index identifying environments supportive of significant hail (≥2 inches). Values >1 indicate potential for large hail; >2 suggests very large hail likely. Integrates MUCAPE, lapse rates, 500mb temp, and shear.", unit: "dimensionless" },
  { term: "DCAPE", full: "Downdraft CAPE", category: "Composite", desc: "A measure of the energy available for downdraft development. High DCAPE (>1000 J/kg) supports strong rear-flank downdrafts (RFD) and damaging straight-line winds in supercells and MCS events.", unit: "J/kg" },
  { term: "DCP", full: "Derecho Composite Parameter", category: "Composite", desc: "Index for identifying environments supportive of derecho (widespread straight-line wind damage) events. Values >10 suggest high derecho potential.", unit: "dimensionless" },

  // Thermodynamics
  { term: "LCL", full: "Lifted Condensation Level", category: "Thermodynamics", desc: "The height at which a rising parcel becomes saturated. Lower LCL heights (<1000m) favor tornado development as they allow lower cloud bases and wider updraft-downdraft separation. LCL >1500m disfavors tornadoes.", unit: "meters" },
  { term: "LFC", full: "Level of Free Convection", category: "Thermodynamics", desc: "The altitude at which a rising parcel becomes positively buoyant and rises on its own. The closer to the surface, the less CIN must be overcome to initiate convection.", unit: "meters" },
  { term: "EL", full: "Equilibrium Level", category: "Thermodynamics", desc: "The altitude at which a rising parcel again reaches the environmental temperature, marking the top of the storm. High EL heights (>14km) support the most violent convection.", unit: "meters" },
  { term: "PWAT", full: "Precipitable Water", category: "Thermodynamics", desc: "Total water vapor in a column of atmosphere. High values (>1.5 inches) support heavy rainfall events. Used in flash flood potential assessment. Values >2 inches in summer are associated with extreme rainfall.", unit: "inches" },
  { term: "Dewpoint", full: "Dewpoint Temperature", category: "Thermodynamics", desc: "The temperature to which air must be cooled at constant pressure to become saturated. Higher dewpoints indicate more moisture. Surface dewpoints ≥65°F support robust convection; ≥70°F are exceptional and fuel extreme storms.", unit: "°F" },
  { term: "Wet Bulb Temp", full: "Wet Bulb Temperature", category: "Thermodynamics", desc: "The lowest temperature achievable by evaporative cooling. Wet bulb ≥35°C is the threshold for potentially fatal heat stress on humans. Also used for freezing rain forecasting near 0°C.", unit: "°C" },
  { term: "850 mb Temp", full: "850 Millibar Temperature", category: "Thermodynamics", desc: "Temperature at ~1500m altitude. Warm 850 mb temperatures (>18°C) in summer indicate an air mass favorable for severe convection; cold 850 mb temps in spring can enhance lapse rates.", unit: "°C" },
  { term: "Freezing Level", full: "Freezing Level", category: "Thermodynamics", desc: "The altitude at which the temperature profile crosses 0°C. Critical for hail size determination (higher = larger potential hail before melting) and winter precipitation forecasting.", unit: "meters" },
  { term: "Wet Bulb Zero", full: "Wet Bulb Zero Height", category: "Thermodynamics", desc: "The height at which the wet bulb temperature is 0°C. Lower WBZ heights (<2500m in summer) favor larger hail reaching the surface. Used with hail size forecasting.", unit: "meters" },

  // Radar
  { term: "VIL", full: "Vertically Integrated Liquid", category: "Radar", desc: "Total amount of liquid water in a column of air detected by radar. High VIL (>50 kg/m²) correlates with large hail threat. VIL Density (VIL/echo top) is more reliable than raw VIL alone.", unit: "kg/m²" },
  { term: "dBZ", full: "Decibels of Radar Reflectivity", category: "Radar", desc: "Measure of radar echo intensity related to precipitation. <20 light rain; 40-50 heavy rain, possible hail; 60-65 large hail; >65 very large hail likely. Correlates with droplet size and density.", unit: "dBZ" },
  { term: "BWER", full: "Bounded Weak Echo Region", category: "Radar", desc: "A notch in radar showing a strong updraft, indicating intense convection with hail production. A strong indicator of severe thunderstorm intensity. Often found in supercells producing large hail.", unit: "" },
  { term: "Hook Echo", full: "Hook Echo", category: "Radar", desc: "Hook-shaped appendage on a supercell's radar return indicating a mesocyclone and often tornado. A classic signature of a tornadic supercell. Forms as precipitation wraps around the rotating updraft.", unit: "" },
  { term: "TBSS", full: "Three-Body Scatter Spike", category: "Radar", desc: "A radar artifact caused by very large hail, creating a false radial echo spike on the far side of the storm. A reliable indicator of large/giant hail (≥2 inch diameter) in the updraft.", unit: "" },
  { term: "Velocity Couplet", full: "Velocity Couplet", category: "Radar", desc: "Adjacent areas of inbound and outbound radar velocities indicating rotation. Tight, intense velocity couplets (high gate-to-gate shear) indicate strong mesocyclone or tornado vortex signatures (TVS).", unit: "" },
  { term: "TVS", full: "Tornado Vortex Signature", category: "Radar", desc: "A radar velocity signature indicating extreme rotation consistent with a tornado. Gate-to-gate shear exceeding 90 kts in a tight couplet strongly suggests an ongoing tornado.", unit: "" },
  { term: "Dual-Pol", full: "Dual-Polarization Radar", category: "Radar", desc: "Modern radar technology that transmits pulses both horizontally and vertically, enabling identification of precipitation types (rain, hail, snow, mixed), biological targets, and debris signatures (TDS).", unit: "" },
  { term: "TDS", full: "Tornado Debris Signature", category: "Radar", desc: "A dual-polarization radar signature (low correlation coefficient, high reflectivity, large differential reflectivity) in the location of a tornado, confirming debris lofting and indicating a violent or significant tornado.", unit: "" },
  { term: "Correlation Coefficient", full: "Correlation Coefficient (CC/ρHV)", category: "Radar", desc: "A dual-pol variable measuring how uniformly shaped/sized particles are in a radar sample volume. CC near 1.0 = rain; lower values indicate mixed-phase precipitation, hail, biological targets, or tornado debris.", unit: "dimensionless" },
  { term: "ZDR", full: "Differential Reflectivity", category: "Radar", desc: "A dual-pol variable representing the ratio of reflectivity in horizontal vs. vertical polarization. Positive ZDR = oblate raindrops; 0 = spherical hail; negative = irregular objects (debris, insects).", unit: "dB" },

  // Warning Products
  { term: "PDS", full: "Particularly Dangerous Situation", category: "Warnings", desc: "NWS/SPC designation for watches or warnings indicating an especially severe or life-threatening situation, reserved for the most extreme events with the highest confidence of violent/significant tornadoes.", unit: "" },
  { term: "Tornado Emergency", full: "Tornado Emergency", category: "Warnings", desc: "The highest-tier tornado warning, issued when a large, violent tornado is confirmed on the ground threatening a populated area. Indicates catastrophic damage and immediate life threat.", unit: "" },
  { term: "SVR Warning", full: "Severe Thunderstorm Warning", category: "Warnings", desc: "NWS warning for thunderstorms producing wind gusts ≥58 mph and/or hail ≥1 inch. 'Considerable' (2+ inch hail or 70+ mph winds) and 'Destructive' (3+ inch hail or 80+ mph winds) tiers exist.", unit: "" },
  { term: "Flash Flood Emergency", full: "Flash Flood Emergency", category: "Warnings", desc: "Extreme flash flood warning tier reserved for life-threatening flooding events with significant, confirmed fatalities or extreme rainfall rates causing catastrophic flooding in populated areas.", unit: "" },
  { term: "Extreme Wind Warning", full: "Extreme Wind Warning", category: "Warnings", desc: "Warning issued for sustained surface winds ≥115 mph or gusts ≥130 mph, typically with a landfalling major hurricane. Indicates catastrophic structural damage is imminent.", unit: "" },

  // Products
  { term: "AFD", full: "Area Forecast Discussion", category: "Products", desc: "NWS technical discussion written by meteorologists explaining reasoning behind their forecasts. Written for an educated audience but publicly available. Valuable for understanding uncertainty and nuance in the forecast.", unit: "" },
  { term: "HWO", full: "Hazardous Weather Outlook", category: "Products", desc: "NWS product describing potential hazardous weather conditions for the next 7 days, issued at least once daily. Day 1 is the most specific; Days 3-7 are general probability statements.", unit: "" },
  { term: "SPS", full: "Special Weather Statement", category: "Products", desc: "NWS product for significant weather events that don't meet warning or advisory criteria. Used for training thunderstorms, gusty winds, dense fog, and other headlines worth communicating to the public.", unit: "" },
  { term: "MCD", full: "Mesoscale Discussion", category: "Products", desc: "SPC product issued when a watch issuance is being considered or significant convective activity is occurring. Often precedes severe watches. Also issued for non-convective events (heavy snow, fire weather).", unit: "" },
  { term: "SAW", full: "Preliminary Severe Watches", category: "Products", desc: "The initial SPC notification to NWS field offices that a tornado or severe thunderstorm watch is planned, issued before the formal watch issuance. Allows offices to prepare messaging.", unit: "" },
  { term: "Spot Forecast", full: "Spot Forecast", category: "Products", desc: "Specialized point forecast from NWS, often issued for wildfire, prescribed burn, or public safety operations. More detailed and site-specific than routine zone forecasts.", unit: "" },

  // Organizations
  { term: "SPC", full: "Storm Prediction Center", category: "Organizations", desc: "NOAA office in Norman, OK that issues convective watches, outlooks (Day 1-8), mesoscale discussions, and fire weather outlooks for the contiguous US. The authority for severe thunderstorm and tornado watch issuance.", unit: "" },
  { term: "WFO", full: "Weather Forecast Office", category: "Organizations", desc: "Local NWS offices responsible for issuing forecasts, watches, and warnings for their local area. There are 122 WFOs across the US. They issue all local warnings, advisories, and zone forecasts.", unit: "" },
  { term: "NHC", full: "National Hurricane Center", category: "Organizations", desc: "NOAA center in Miami, FL responsible for tracking tropical weather systems in the Atlantic and eastern Pacific basins. Issues advisories, watches, and warnings for tropical storms and hurricanes.", unit: "" },
  { term: "AWC", full: "Aviation Weather Center", category: "Organizations", desc: "NOAA center providing aviation weather products including SIGMETs, AIRMETs, and pireps. Located in Kansas City, MO.", unit: "" },
  { term: "NWS", full: "National Weather Service", category: "Organizations", desc: "The primary US government agency responsible for weather forecasts, warnings, and observations. Part of NOAA. Includes 122 WFOs, the SPC, NHC, and other specialized centers.", unit: "" },
  { term: "NOAA", full: "National Oceanic and Atmospheric Administration", category: "Organizations", desc: "US federal agency encompassing the NWS, NHC, NSSL, ESRL, and other scientific organizations. Responsible for weather, oceans, fisheries, and satellite operations.", unit: "" },

  // Storm Types
  { term: "MCS", full: "Mesoscale Convective System", category: "Storm Types", desc: "A large organized cluster of thunderstorms that covers hundreds of miles. Includes squall lines, bow echoes, MCSs, and derechos. Often produces widespread damaging winds and heavy rain over large areas.", unit: "" },
  { term: "QLCS", full: "Quasi-Linear Convective System", category: "Storm Types", desc: "A line of storms that can produce brief tornadoes (often from embedded supercells or line-end vortices), especially with bowing segments (bow echoes), and widespread damaging winds.", unit: "" },
  { term: "Mesocyclone", full: "Mesocyclone", category: "Storm Types", desc: "Rotating updraft in a supercell thunderstorm. Typically 2-10km diameter. A prerequisite for most significant tornadoes. Detected by Doppler radar as a persistent rotating signature.", unit: "" },
  { term: "Supercell", full: "Supercell", category: "Storm Types", desc: "The most dangerous type of thunderstorm, characterized by a deep, persistently rotating updraft (mesocyclone). Responsible for the majority of significant tornadoes and extreme hail. Three types: classic, high-precipitation (HP), and low-precipitation (LP).", unit: "" },
  { term: "Derecho", full: "Derecho", category: "Storm Types", desc: "A widespread, long-lived straight-line wind event associated with a fast-moving band of thunderstorms. Must meet criteria of ≥240 miles of damage with gusts ≥58 mph, including at least 3 reports ≥75 mph.", unit: "" },
  { term: "Bow Echo", full: "Bow Echo", category: "Storm Types", desc: "A bow-shaped radar echo indicating a fast-moving severe thunderstorm complex. The bow shape results from strong outflow winds. The northern bookend and rear-inflow jet are associated with the most damaging winds.", unit: "" },
  { term: "Squall Line", full: "Squall Line", category: "Storm Types", desc: "A linear arrangement of thunderstorms along or ahead of a cold front or dryline. Can produce widespread severe weather including hail, wind damage, and embedded tornadoes (especially in QLCS mode).", unit: "" },
  { term: "LP Supercell", full: "Low-Precipitation Supercell", category: "Storm Types", desc: "A supercell with very little precipitation, often displaying a distinctive striated (corkscrew) appearance. Common on the high plains and dry air masses. Frequently produces large hail.", unit: "" },
  { term: "HP Supercell", full: "High-Precipitation Supercell", category: "Storm Types", desc: "A supercell embedded in heavy precipitation, making it difficult to observe visually. Particularly dangerous because the tornado can be rain-wrapped and invisible. Common in the Southeast US.", unit: "" },
  { term: "Mini-Supercell", full: "Mini-Supercell", category: "Storm Types", desc: "A smaller-than-normal supercell, typically 2-5km tall, that often forms in tropical air masses or landfalling tropical systems. Can still produce tornadoes despite its small size.", unit: "" },
  { term: "Discrete Supercell", full: "Discrete Supercell", category: "Storm Types", desc: "A supercell that develops in isolation, away from other convection. More likely to become tornadic because it can access its full inflow without competing with neighboring storms.", unit: "" },

  // Tornadoes
  { term: "EF Scale", full: "Enhanced Fujita Scale", category: "Tornadoes", desc: "0-5 scale rating tornado damage intensity. EF0 (65-85mph), EF1 (86-110mph), EF2 (111-135mph), EF3 (136-165mph), EF4 (166-200mph), EF5 (>200mph). Assigned by post-storm damage surveys.", unit: "" },
  { term: "Waterspout", full: "Waterspout", category: "Tornadoes", desc: "A rotating column of air over water. Fair-weather waterspouts are non-supercellular (form from the surface up) and are generally weak. Tornadic waterspouts are supercell tornadoes that cross from land to water.", unit: "" },
  { term: "Landspout", full: "Landspout", category: "Tornadoes", desc: "A non-supercellular tornado that forms from the ground up (not from a mesocyclone aloft). Typically weak (EF0-EF1) and short-lived. Common on the High Plains east of the Rockies.", unit: "" },
  { term: "Multi-Vortex Tornado", full: "Multi-Vortex Tornado", category: "Tornadoes", desc: "A tornado with two or more smaller vortices (suction vortices) rotating around a common center. Can produce extreme damage due to the additive wind speeds of the main circulation and suction vortices.", unit: "" },
  { term: "Cyclic Supercell", full: "Cyclic Supercell", category: "Tornadoes", desc: "A supercell that produces multiple tornadoes over its lifetime. Typically involves the repeated occlusion of mesocyclones and formation of new ones, sometimes producing 3-5 or more tornadoes.", unit: "" },
  { term: "TDS", full: "Tornado Debris Signature", category: "Tornadoes", desc: "A dual-polarization radar signature confirming a tornado is on the ground, lofting debris. Characterized by very low correlation coefficient, high reflectivity, and irregular ZDR within the tornado circulation.", unit: "" },
  { term: "DAM", full: "Damage Assessment Toolkit", category: "Tornadoes", desc: "NWS tool used to correlate tornado paths with damage indicators from satellite/aerial imagery and field surveys. Used to assign final EF scale ratings.", unit: "" },

  // Tropical
  { term: "ITCZ", full: "Intertropical Convergence Zone", category: "Tropical", desc: "A belt of low pressure near the equator where northeast and southeast trade winds converge. The primary region of tropical storm genesis. Shifts north/south with the seasons.", unit: "" },
  { term: "MJO", full: "Madden-Julian Oscillation", category: "Tropical", desc: "A large-scale wave of enhanced and suppressed tropical rainfall that propagates eastward around the globe over a 30-60 day period. Significantly influences hurricane activity and CONUS precipitation patterns.", unit: "" },
  { term: "SAL", full: "Saharan Air Layer", category: "Tropical", desc: "A layer of very dry, dusty air that originates over the Sahara Desert and spreads westward over the tropical Atlantic. Inhibits Atlantic hurricane development by increasing wind shear and drying the mid-troposphere.", unit: "" },
  { term: "SST", full: "Sea Surface Temperature", category: "Tropical", desc: "The temperature of ocean surface waters. Tropical cyclones require SSTs ≥26°C (79°F) for development and intensification. SSTs >30°C can support rapid intensification.", unit: "°C" },
  { term: "Rapid Intensification", full: "Rapid Intensification", category: "Tropical", desc: "Defined as an increase in maximum sustained winds of ≥35 mph in 24 hours. Occurs in favorable environments with low wind shear, high SSTs, and high moist mid-level relative humidity.", unit: "" },
  { term: "Eyewall Replacement", full: "Eyewall Replacement Cycle", category: "Tropical", desc: "A process in intense hurricanes where an outer rainband contracts to form a new eyewall, causing the inner eyewall to dissipate. Temporarily weakens the storm but often results in a larger, potentially more powerful hurricane.", unit: "" },

  // Winter Weather
  { term: "FZRA", full: "Freezing Rain", category: "Winter", desc: "Rain that falls as liquid but freezes upon contact with surfaces at or below 0°C. Creates ice accretion (glaze ice) on roads, trees, and infrastructure. Even light icing (0.25 inch) can be extremely dangerous.", unit: "" },
  { term: "ZR", full: "Freezing Rain", category: "Winter", desc: "METAR abbreviation for freezing rain. Can also appear as FZRA on aviation products. Any amount of freezing rain significantly increases crash risk on roadways.", unit: "" },
  { term: "Sleet", full: "Ice Pellets / Sleet", category: "Winter", desc: "Precipitation that starts as rain or snow, partially freezes in a sub-freezing layer, and reaches the surface as ice pellets. Less hazardous than freezing rain but can accumulate and create icy roads.", unit: "" },
  { term: "QPF", full: "Quantitative Precipitation Forecast", category: "Winter", desc: "Forecast of total liquid precipitation over a given period. In winter, QPF is converted to snow water equivalent (SWE) and then to snowfall using snow-to-liquid ratios (typically 10:1 but can range from 4:1 to 30:1).", unit: "inches" },
  { term: "SRQPE", full: "Snow-to-Liquid Ratio", category: "Winter", desc: "The ratio of snowfall to its melted liquid equivalent. A standard ratio is 10:1 (1 inch of water = 10 inches of snow). Fluffy, cold snow has high ratios (15-20:1+); wet snow has low ratios (4-6:1).", unit: "ratio" },
  { term: "Post-Frontal Convection", full: "Post-Frontal Convection", category: "Winter", desc: "Thundersnow or lake-effect convection that develops in cold air masses after frontal passage. Can produce intense, localized snowfall rates of 2-4+ inches per hour in a narrow band.", unit: "" },
  { term: "Lake Effect", full: "Lake-Effect Snow", category: "Winter", desc: "Heavy localized snowfall resulting from cold air passing over warmer lake water. The Great Lakes region is the classic US example. Narrow bands can deposit 1-3 feet of snow downwind while adjacent areas receive little or none.", unit: "" },
  { term: "Bombogenesis", full: "Bombogenesis", category: "Winter", desc: "Rapid explosive cyclogenesis — when a mid-latitude cyclone's central pressure drops ≥24 mb in 24 hours. Creates intense winter storms (bomb cyclones) with high winds, heavy snow, and coastal flooding.", unit: "mb/24hr" },

  // Fire Weather
  { term: "Red Flag Warning", full: "Red Flag Warning", category: "Fire Weather", desc: "NWS warning issued when critical fire weather conditions are forecast: relative humidity ≤15%, winds ≥25 mph, and fuel moisture ≤10%. Any ignition can lead to rapid, large fire growth.", unit: "" },
  { term: "Haines Index", full: "Haines Index", category: "Fire Weather", desc: "A fire weather index measuring the potential for dry, unstable air to contribute to plume-dominated wildfire growth. Combines lower atmospheric stability and moisture. Range 2-6; values ≥5 indicate high large fire potential.", unit: "1-6" },
  { term: "FFWI", full: "Fosberg Fire Weather Index", category: "Fire Weather", desc: "An index measuring fire spread potential based on wind speed, relative humidity, and temperature. Values >50 indicate critical fire weather conditions; >100 indicate extreme conditions.", unit: "0-100" },
  { term: "ERC", full: "Energy Release Component", category: "Fire Weather", desc: "A number related to the available energy per unit area in the flaming front of a fire. Higher ERC values indicate drier, more energetic fuels. Used with National Fire Danger Rating System (NFDRS).", unit: "BTU/ft²" },
  { term: "Fine Fuel Moisture", full: "Fine Fuel Moisture Content", category: "Fire Weather", desc: "The moisture content of small-diameter dead fuels (grasses, pine needles). Below 10% is critically dry and supports rapid fire spread. Below 5% represents extreme fire danger.", unit: "%" },
  { term: "Pyroconvection", full: "Pyroconvection", category: "Fire Weather", desc: "Convection driven by fire heat. In extreme cases creates fire-induced thunderstorms (pyrocumulonimbus or pyroCb), which can generate their own lightning, firebrands, and erratic fire behavior independent of synoptic forcing.", unit: "" },

  // Mesoscale Features
  { term: "MCV", full: "Mesoscale Convective Vortex", category: "Mesoscale", desc: "A low-level, warm-core vortex left behind by an MCS. Can persist for 12-36 hours after the parent MCS dissipates, sometimes triggering new convection the following afternoon. Difficult to detect on radar.", unit: "" },
  { term: "Dryline", full: "Dryline", category: "Mesoscale", desc: "A boundary separating moist Gulf air from dry, hot air from the Southwest US. A major initiator of severe thunderstorms across the southern and central plains. Moves eastward during the day and retrogrades westward at night.", unit: "" },
  { term: "Outflow Boundary", full: "Outflow Boundary", category: "Mesoscale", desc: "A boundary formed by the leading edge of cold air spreading out from thunderstorm downdrafts. Can initiate new convection and, when interacting with the low-level jet, enhance tornado potential.", unit: "" },
  { term: "LLJ", full: "Low-Level Jet", category: "Mesoscale", desc: "A nocturnal maximum in southerly winds typically at 850-925 mb, often strengthening to 40-60+ knots after dark over the central US. Transports moisture northward, drives nocturnal convection, and enhances SRH for tornado development.", unit: "knots" },
  { term: "Thermal Trough", full: "Thermal Trough", category: "Mesoscale", desc: "A surface pressure trough caused by surface heating. Common in the Southwest US desert regions and can trigger dust devils, haboobs, and convergence-forced thunderstorms.", unit: "" },
  { term: "Sea Breeze Front", full: "Sea Breeze Front", category: "Mesoscale", desc: "A thermally-driven coastal convergence boundary where cool marine air meets warm onshore air. Can trigger afternoon thunderstorms along coastlines and enhance tornado potential when interacting with other boundaries.", unit: "" },
  { term: "Bore", full: "Atmospheric Bore", category: "Mesoscale", desc: "A propagating disturbance in a stable boundary layer, similar to a hydraulic bore on water. Associated with rapid pressure rises, sudden wind shifts, and sometimes triggering new convection at night.", unit: "" },

  // Synoptic Scale
  { term: "Jet Streak", full: "Jet Streak", category: "Synoptic", desc: "A local maximum of wind speed within the jet stream. Regions of divergence (exit region left side) can induce upward motion, destabilizing the atmosphere and enhancing severe weather potential.", unit: "knots" },
  { term: "PV", full: "Potential Vorticity", category: "Synoptic", desc: "A conserved quantity combining atmospheric vorticity and static stability. Upper-level PV anomalies (thinning tropopause) enhance low-level cyclogenesis and instability beneath them.", unit: "PVU" },
  { term: "NAM", full: "North American Mesoscale Model", category: "Models", desc: "A numerical weather prediction model run 4 times daily by NCEP with a 3km nest. Good for short-range severe weather forecasting but can struggle with convective initiation timing.", unit: "" },
  { term: "GFS", full: "Global Forecast System", category: "Models", desc: "NOAA's primary global model run 4 times daily out to 16 days at ~13km resolution. Backbone of US medium-range forecasting.", unit: "" },
  { term: "ECMWF", full: "European Centre for Medium-Range Weather Forecasts", category: "Models", desc: "Widely regarded as the world's best global forecast model. Exceptional skill in medium-range (3-10 day) forecasting. Known for accurately forecasting major events far in advance.", unit: "" },
  { term: "HREF", full: "High-Resolution Ensemble Forecast", category: "Models", desc: "An ensemble of high-resolution models designed to characterize convective hazard potential. Used by SPC for severe weather outlooks. Excels at capturing the probabilistic nature of convective initiation.", unit: "" },
  { term: "RAP", full: "Rapid Refresh Model", category: "Models", desc: "NOAA model run hourly out to 21 hours at 13km resolution. Excellent for short-range convective forecasting and rapidly updating soundings, especially useful on outbreak days.", unit: "" },
  { term: "HRRR", full: "High-Resolution Rapid Refresh", category: "Models", desc: "NOAA's 3km hourly-run convection-allowing model. Explicitly resolves individual thunderstorm cells. Best-in-class for 0-18 hour convective forecasting during active weather situations.", unit: "" },

  // AQI & Environmental
  { term: "AQI", full: "Air Quality Index", category: "AQI & Environmental", desc: "A scale from 0-500 measuring air quality. 0-50 Good; 51-100 Moderate; 101-150 Unhealthy for Sensitive Groups; 151-200 Unhealthy; 201-300 Very Unhealthy; 301-500 Hazardous.", unit: "0-500" },
  { term: "PM2.5", full: "Fine Particulate Matter", category: "AQI & Environmental", desc: "Airborne particles ≤2.5 micrometers in diameter. Can penetrate deep into lungs and bloodstream. Primary driver of AQI in urban areas and during wildfire smoke events. Major health hazard above 35 μg/m³ (24hr avg).", unit: "μg/m³" },
  { term: "Ozone", full: "Ground-Level Ozone (O₃)", category: "AQI & Environmental", desc: "A secondary pollutant formed when NOx and VOCs react in sunlight. A major respiratory irritant. Highest on hot, sunny summer afternoons in urban areas. Damages lung tissue with repeated exposure.", unit: "ppb" },
  { term: "Inversion", full: "Temperature Inversion", category: "AQI & Environmental", desc: "A layer where temperature increases with altitude rather than decreasing. Traps pollutants near the surface and suppresses convection. Surface-based inversions are common at night and create fog, smog, and poor air quality.", unit: "" },
  { term: "AOD", full: "Aerosol Optical Depth", category: "AQI & Environmental", desc: "A satellite-derived measure of how much aerosol (smoke, dust, haze) is in a column of atmosphere, blocking sunlight. Used to track wildfire smoke plumes and Saharan dust over large areas.", unit: "dimensionless" },
  { term: "NO₂", full: "Nitrogen Dioxide", category: "AQI & Environmental", desc: "A reddish-brown gas from combustion (vehicles, power plants). A respiratory irritant and precursor to ground-level ozone and particulate matter. Concentrations peak near busy roadways.", unit: "ppb" },

  // Basics — foundational terms for new weather enthusiasts
  { term: "Thunderstorm", full: "Thunderstorm", category: "Basics", desc: "A storm produced by a cumulonimbus cloud, always containing lightning and thunder. Requires three ingredients: moisture, instability, and lift. Becomes 'severe' at ≥58 mph winds, ≥1 inch hail, or a tornado.", unit: "" },
  { term: "Updraft", full: "Updraft", category: "Basics", desc: "The rising current of warm, moist air that fuels a thunderstorm. Stronger updrafts support taller storms, larger hail, and (with rotation) tornadoes. Updraft strength scales with instability (CAPE).", unit: "" },
  { term: "Downdraft", full: "Downdraft", category: "Basics", desc: "Sinking air within a thunderstorm, driven by precipitation drag and evaporative cooling. Reaching the ground, it spreads out as gusty outflow and can produce damaging straight-line winds.", unit: "" },
  { term: "Convection", full: "Convection", category: "Basics", desc: "The vertical transport of heat and moisture by rising air parcels. In meteorology, 'convection' is shorthand for showers and thunderstorms that form when unstable air rises.", unit: "" },
  { term: "Lift", full: "Lifting Mechanism", category: "Basics", desc: "Any process that forces air upward to its level of free convection — fronts, drylines, outflow boundaries, terrain, or daytime heating. The trigger that releases instability into storms.", unit: "" },
  { term: "Cold Front", full: "Cold Front", category: "Basics", desc: "The leading edge of an advancing cold air mass. Lifts warm air sharply, often triggering a line of showers and thunderstorms. Passage brings wind shifts, temperature drops, and clearing.", unit: "" },
  { term: "Warm Front", full: "Warm Front", category: "Basics", desc: "The leading edge of advancing warm air overriding cooler air. Produces widespread layered clouds and steady precipitation ahead of it. Often a focus for elevated convection and freezing rain in winter.", unit: "" },
  { term: "Dryline", full: "Dryline (Basics)", category: "Basics", desc: "A boundary between moist and dry air, most common in the Southern Plains. A favored ignition zone for supercells on spring afternoons as it mixes eastward.", unit: "" },
  { term: "Trough", full: "Trough", category: "Basics", desc: "An elongated region of lower atmospheric pressure. Upper-level troughs bring cooler air, lift, and increased storm potential downstream of their axis.", unit: "" },
  { term: "Ridge", full: "Ridge", category: "Basics", desc: "An elongated region of higher pressure, usually bringing sinking air, warm/dry conditions, and suppressed storms. Persistent summer ridges drive heat waves ('heat domes').", unit: "" },
  { term: "Relative Humidity", full: "Relative Humidity", category: "Basics", desc: "The amount of water vapor in the air relative to the maximum it can hold at that temperature, as a percentage. 100% means saturation (fog/clouds). Dewpoint is a better measure of absolute moisture.", unit: "%" },
  { term: "Heat Index", full: "Heat Index", category: "Basics", desc: "The 'feels-like' temperature combining air temperature and humidity, reflecting reduced sweat evaporation. Values ≥103°F (extended) prompt heat advisories; ≥125°F is extremely dangerous.", unit: "°F" },
  { term: "Wind Chill", full: "Wind Chill", category: "Basics", desc: "The 'feels-like' temperature in cold conditions accounting for heat loss from wind over exposed skin. Wind chills below -18°F can cause frostbite within 30 minutes.", unit: "°F" },
  { term: "Advection", full: "Advection", category: "Basics", desc: "Horizontal transport of an atmospheric property (heat, moisture, vorticity) by the wind. Warm-air advection promotes rising motion and clouds; cold-air advection promotes sinking and clearing.", unit: "" },

  // Clouds & visual storm features
  { term: "Cumulonimbus", full: "Cumulonimbus (Cb)", category: "Clouds", desc: "The towering thunderstorm cloud, extending from near the surface to the tropopause. Its flattened, anvil-shaped top marks where the updraft hits stable air. The only cloud that produces lightning, hail, and tornadoes.", unit: "" },
  { term: "Anvil", full: "Anvil Cloud", category: "Clouds", desc: "The flat, spreading top of a mature thunderstorm, formed where the updraft reaches the tropopause and spreads horizontally. Anvil-level lightning can strike many miles from the storm core ('bolt from the blue').", unit: "" },
  { term: "Wall Cloud", full: "Wall Cloud", category: "Clouds", desc: "An isolated, lowered cloud base beneath a supercell's rain-free base, marking the strongest part of the updraft/mesocyclone. A persistent, rotating wall cloud often precedes a tornado.", unit: "" },
  { term: "Shelf Cloud", full: "Shelf Cloud", category: "Clouds", desc: "A low, wedge-shaped cloud attached to the leading edge of a storm's outflow (gust front). Signals strong straight-line winds are arriving — not rotation. Common with squall lines and bow echoes.", unit: "" },
  { term: "Funnel Cloud", full: "Funnel Cloud", category: "Clouds", desc: "A rotating, funnel-shaped cloud extending from a storm base that has NOT reached the ground. Becomes a tornado on ground contact. Take it as a serious warning sign.", unit: "" },
  { term: "Mammatus", full: "Mammatus Clouds", category: "Clouds", desc: "Pouch-like protrusions hanging beneath a thunderstorm anvil, caused by sinking pockets of cooler air. Often appear after the strongest part of a storm has passed; visually dramatic but not directly dangerous.", unit: "" },
  { term: "Scud", full: "Scud (Fractus)", category: "Clouds", desc: "Ragged, low cloud fragments that form in the moist, rain-cooled air near a storm. Often mistaken for funnel clouds, but scud is non-rotating and moves with the wind rather than spinning.", unit: "" },
  { term: "Overshooting Top", full: "Overshooting Top", category: "Clouds", desc: "A dome of cloud punching above the smooth anvil, where a very strong updraft briefly overshoots the tropopause. Indicates an intense, likely severe storm; visible on satellite and from the ground.", unit: "" },
  { term: "Lenticular", full: "Lenticular Cloud", category: "Clouds", desc: "A smooth, lens-shaped cloud that forms in the wave crests of air flowing over mountains. Stationary despite strong winds. Indicates strong winds and moisture aloft; popular with photographers.", unit: "" },

  // Lightning
  { term: "CG Lightning", full: "Cloud-to-Ground Lightning", category: "Lightning", desc: "A lightning discharge between a cloud and the ground — the type that poses a direct threat to people. Most CG strikes are negatively charged; rarer positive CG strikes are more powerful and can strike far from the storm.", unit: "" },
  { term: "IC Lightning", full: "Intracloud Lightning", category: "Lightning", desc: "Lightning that stays within or between clouds without reaching the ground. The most common lightning type, often seen as sheet-like flashes illuminating the cloud ('heat lightning' when too distant to hear thunder).", unit: "" },
  { term: "Positive CG", full: "Positive Cloud-to-Ground", category: "Lightning", desc: "A lightning strike carrying positive charge to the ground, often originating from the anvil and striking far from the storm core. Carries far more energy than typical strikes — a major wildfire and casualty risk.", unit: "" },
  { term: "GLM", full: "Geostationary Lightning Mapper", category: "Lightning", desc: "An instrument aboard GOES satellites that continuously maps total lightning (in-cloud + cloud-to-ground) across the hemisphere. Rapid increases in flash rate ('lightning jumps') often precede severe weather.", unit: "" },

  // Flooding & hydrology
  { term: "Flash Flood", full: "Flash Flood", category: "Flooding", desc: "Rapid flooding of low-lying areas in under 6 hours of heavy rain, dam failure, or ice jam. The leading cause of thunderstorm-related deaths in the US. 'Turn Around, Don't Drown' — 12 inches of moving water can sweep a car away.", unit: "" },
  { term: "FFG", full: "Flash Flood Guidance", category: "Flooding", desc: "The amount of rainfall over a given duration needed to cause flash flooding in a specific area, accounting for soil moisture. Forecasters compare expected rainfall against FFG to assess flood risk.", unit: "inches" },
  { term: "Training", full: "Training Storms", category: "Flooding", desc: "When thunderstorms repeatedly move over the same area like railcars on a track, producing prolonged heavy rain over one location. A primary mechanism for extreme flash-flooding events.", unit: "" },
  { term: "ARI", full: "Average Recurrence Interval", category: "Flooding", desc: "The statistical likelihood of a rainfall amount, expressed as a return period (e.g. a '100-year rain' has a 1% chance in any year). Used to communicate how rare and dangerous an extreme rainfall event is.", unit: "years" },

  // Climate & pattern drivers
  { term: "ENSO", full: "El Niño–Southern Oscillation", category: "Patterns", desc: "A recurring climate pattern of warming (El Niño) and cooling (La Niña) in the tropical Pacific that shifts global weather. Strongly modulates US winter storm tracks, drought, and Atlantic hurricane activity.", unit: "" },
  { term: "El Niño", full: "El Niño", category: "Patterns", desc: "The warm phase of ENSO. Typically increases wind shear over the Atlantic (suppressing hurricanes), wets the southern US, and dries the Pacific Northwest and Ohio Valley in winter.", unit: "" },
  { term: "La Niña", full: "La Niña", category: "Patterns", desc: "The cool phase of ENSO. Generally favors a more active Atlantic hurricane season, drier/warmer conditions across the southern US, and an active northern storm track.", unit: "" },
  { term: "NAO", full: "North Atlantic Oscillation", category: "Patterns", desc: "A seesaw in pressure between the Icelandic Low and Azores High. The negative phase favors cold-air outbreaks and blocking over the eastern US and Europe; the positive phase favors mild, zonal flow.", unit: "" },
  { term: "Atmospheric River", full: "Atmospheric River", category: "Patterns", desc: "A long, narrow corridor of concentrated water vapor transport (e.g. the 'Pineapple Express'). Responsible for much of the West Coast's heavy rain, mountain snow, and flooding.", unit: "" },
  { term: "Omega Block", full: "Omega Block", category: "Patterns", desc: "A blocking pattern shaped like the Greek letter Ω — a ridge flanked by two troughs — that stalls weather systems for days. Brings prolonged heat under the ridge and persistent storms/cold in the troughs.", unit: "" },
  { term: "Cutoff Low", full: "Cutoff Low", category: "Patterns", desc: "An upper-level low that has detached from the main jet-stream flow, drifting slowly and unpredictably. Produces prolonged unsettled weather and is notoriously hard for models to handle.", unit: "" },

  // Observations & tools
  { term: "Sounding", full: "Atmospheric Sounding", category: "Observations", desc: "A vertical profile of temperature, dewpoint, and wind through the atmosphere, usually from a weather balloon (radiosonde) or model. The fundamental tool for assessing instability and shear.", unit: "" },
  { term: "Skew-T", full: "Skew-T Log-P Diagram", category: "Observations", desc: "The standard thermodynamic chart for plotting a sounding. Temperature lines are skewed 45°; the area between the parcel and environment curves represents CAPE (positive) or CIN (negative).", unit: "" },
  { term: "Radiosonde", full: "Radiosonde", category: "Observations", desc: "An instrument package carried aloft by a weather balloon, transmitting temperature, humidity, pressure, and wind as it rises. Launched twice daily (00Z/12Z) worldwide to initialize forecast models.", unit: "" },
  { term: "Mesonet", full: "Mesonet", category: "Observations", desc: "A dense network of automated surface weather stations providing high-resolution observations (often every 5 minutes). Invaluable for tracking boundaries, mesoscale features, and verifying warnings.", unit: "" },
  { term: "ASOS", full: "Automated Surface Observing System", category: "Observations", desc: "The primary US automated weather stations, mostly at airports, reporting conditions every minute and generating METARs. The backbone of official surface climate and aviation observations.", unit: "" },
  { term: "Spotter", full: "Storm Spotter", category: "Observations", desc: "A trained volunteer who reports real-time ground truth (hail size, wind damage, funnel clouds) to the NWS via SKYWARN. Spotter reports are critical for verifying radar-indicated warnings.", unit: "" },

  // Aviation
  { term: "METAR", full: "Aviation Routine Weather Report", category: "Aviation", desc: "A coded hourly surface observation used in aviation, reporting wind, visibility, cloud layers, temperature/dewpoint, pressure, and significant weather. The most widely used surface ob format worldwide.", unit: "" },
  { term: "TAF", full: "Terminal Aerodrome Forecast", category: "Aviation", desc: "A coded forecast for the weather within ~5 statute miles of an airport, typically covering 24-30 hours. Used by pilots and dispatchers for flight planning.", unit: "" },
  { term: "SIGMET", full: "Significant Meteorological Information", category: "Aviation", desc: "An in-flight advisory of weather hazardous to all aircraft — severe turbulence, icing, dust storms, volcanic ash, or thunderstorms. Convective SIGMETs cover organized thunderstorm activity.", unit: "" },
  { term: "Ceiling", full: "Cloud Ceiling", category: "Aviation", desc: "The height above ground of the lowest broken or overcast cloud layer. A key aviation parameter — low ceilings (with low visibility) define instrument flight rules (IFR) conditions.", unit: "feet" },
];

const CATEGORIES = [...new Set(GLOSSARY_TERMS.map(t => t.category))].sort();

export default function WeatherGlossary() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return GLOSSARY_TERMS.filter(t => {
      const matchesSearch = !q || t.term.toLowerCase().includes(q) || t.full.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      const matchesCat = !activeCategory || t.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [search, activeCategory]);

  const categoryColors: Record<string, string> = {
    "Instability": "#f97316",
    "Wind Shear": "#7B8FD9",
    "Composite": "#a78bfa",
    "Thermodynamics": "#06b6d4",
    "Radar": "#22c55e",
    "Warnings": "#ef4444",
    "Products": "#fbbf24",
    "Organizations": "#ec4899",
    "Storm Types": "#f43f5e",
    "Tornadoes": "#dc2626",
    "Tropical": "#0ea5e9",
    "Winter": "#93c5fd",
    "Fire Weather": "#fb923c",
    "Mesoscale": "#84cc16",
    "Synoptic": "#e879f9",
    "Models": "#38bdf8",
    "AQI & Environmental": "#34d399",
    "Basics": "#94a3b8",
    "Clouds": "#a5b4fc",
    "Lightning": "#facc15",
    "Flooding": "#3b82f6",
    "Patterns": "#c084fc",
    "Observations": "#fca5a5",
    "Aviation": "#2dd4bf",
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Weather Glossary & Index</h2>
      </div>
      <p className="text-sm text-muted-foreground">Comprehensive meteorological reference — <strong className="text-foreground">{GLOSSARY_TERMS.length} definitions</strong> across {CATEGORIES.length} categories</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search terms, descriptions, categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm outline-none focus:border-primary/60 transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!activeCategory ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
        >
          All ({GLOSSARY_TERMS.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = GLOSSARY_TERMS.filter(t => t.category === cat).length;
          const color = categoryColors[cat] ?? "#7B8FD9";
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${activeCategory === cat ? "text-black" : "bg-card hover:border-opacity-60"}`}
              style={activeCategory === cat
                ? { backgroundColor: color, borderColor: color }
                : { borderColor: color + "60", color }
              }
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} term{filtered.length !== 1 ? "s" : ""} found</div>

      <div className="space-y-3">
        {filtered.map((term, i) => {
          const color = categoryColors[term.category] ?? "#7B8FD9";
          return (
            <div key={i} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <span className="font-bold text-primary">{term.term}</span>
                  {term.full !== term.term && (
                    <span className="text-sm text-muted-foreground ml-2">— {term.full}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {term.unit && (
                    <span className="text-xs bg-muted/40 px-1.5 py-0.5 rounded font-mono">{term.unit}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: color + "20", color }}>
                    {term.category}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{term.desc}</p>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No terms match your search. Try a different keyword or clear the category filter.
          </div>
        )}
      </div>
    </div>
  );
}
