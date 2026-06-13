import { validateGstin } from "../services/ewayAuth.js";
import { updatePartBVehicle } from "../services/updatePartB.js";
import {
  DEFAULT_PART_B_REASON_CODE,
  isRoadMode,
  reasonRemForPartB,
  requiresTransDocNo,
  todayTransDocDate,
} from "../utils/ewayBillPartB.js";
import { EWB_INCORRECT_MESSAGE, EWB_NUMBER_LENGTH, parseEwbInput } from "../utils/ewbNumber.js";
import { verifyEwayBillNumber } from "../services/verifyEwayBill.js";
import { logger } from "../utils/logger.js";
import { hasLoggedInAuth } from "../services/ewbSession.js";
import { autoLoginFromRegistry, completeWhatsAppLogin } from "./autoLogin.js";
import { findOnboardedUser } from "./onboardLookup.js";
import { normalizePhone } from "./phoneRegistryUtils.js";
import { formatEwbAuthFailure } from "../utils/ewbAuthErrors.js";
import { recordEwbOperation } from "../db/ewbOperations.js";
import { ensureWhatsAppEwbToken } from "./ewbSessionRefresh.js";
import { getAccountForPhone, savePhoneMapping } from "./phoneRegistry.js";
import { sendEwayBillPdf } from "./sendPdf.js";
import { sendInteractiveButtons, sendWhatsAppText } from "./whatsappApi.js";
import {
  STATES,
  createEmptySession,
  createUserSession,
  deleteSession,
  getSession,
  saveSession,
} from "./sessionStore.js";

const MODE_MAP = {
  1: "1",
  2: "2",
  3: "3",
  mode_road: "1",
  mode_rail: "2",
  mode_air: "3",
  road: "1",
  rail: "2",
  air: "3",
};

function normalize(text) {
  return String(text || "").trim();
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

function welcomeMessage() {
  return (
    "👋 *Welcome to Eway Bot*\n\n" +
    "I help you update e-Way Bill Part B.\n\n" +
    "Please enter your *User ID* (E-Way Bill portal username):"
  );
}

function loginFailedMessage() {
  return "❌ *Incorrect details.* Please try again.\n\n" + welcomeMessage();
}

function resetToLogin(session) {
  session.state = STATES.LOGIN_USERNAME;
  session.draft = { login: {}, partB: {} };
  session.auth = null;
  return session;
}

function isLoginError(err) {
  return (
    err.status === 401 ||
    /invalid|incorrect|authentication failed|error \d+/i.test(err.message || "")
  );
}

async function replyText(phone, text) {
  await sendWhatsAppText(phone, text);
}

async function sendLoginButton(phone) {
  await sendInteractiveButtons(phone, "You have been logged out.\n\nTap *Login* to sign in again.", [
    { id: "menu_login", title: "Login" },
  ]);
}

async function sendMainMenu(phone, username) {
  await sendInteractiveButtons(
    phone,
    `✅ Logged in as *${username}*\n\nWhat would you like to do?`,
    [
      { id: "menu_part_b", title: "Update Part B" },
      { id: "menu_logout", title: "Logout" },
    ]
  );
}

async function sendModeMenu(phone) {
  await sendInteractiveButtons(phone, "Select *mode of transport*:", [
    { id: "mode_road", title: "Road" },
    { id: "mode_rail", title: "Rail" },
    { id: "mode_air", title: "Air" },
  ]);
}

async function executePartBUpdate(phone, session) {
  const partB = session.draft.partB;
  const reasonCode = DEFAULT_PART_B_REASON_CODE;

  session = (await ensureWhatsAppEwbToken(phone)) || session;
  const accessToken = session.auth.access_token;

  await replyText(phone, "⏳ Updating Part B…");

  const updateBody = {
    ewbNo: Number(partB.ewbNo),
    transMode: partB.transMode,
    fromPlace: partB.fromPlace,
    reasonCode,
    reasonRem: reasonRemForPartB(partB.transMode, reasonCode),
    transDocDate: todayTransDocDate(),
  };

  if (isRoadMode(partB.transMode)) {
    updateBody.vehicleNo = partB.vehicleNo;
    updateBody.vehicleType = "R";
  } else if (requiresTransDocNo(partB.transMode)) {
    updateBody.transDocNo = partB.transDocNo;
  }

  const result = await updatePartBVehicle(partB.ewbNo, accessToken, updateBody);

  await recordEwbOperation({
    username: session.auth?.username,
    gstin: session.auth?.gstin,
    ewbNo: partB.ewbNo,
    operationType: "part_b_update",
    source: "whatsapp",
  });

  session.state = STATES.MENU;
  session.draft.partB = {};
  saveSession(phone, session);

  await replyText(
    phone,
    `✅ *Part B updated*\n\n` +
      `E-Way Bill: *${partB.ewbNo}*\n` +
      `Valid upto: ${result.validUpto || "—"}\n` +
      `Updated: ${result.vehUpdDate || "—"}`
  );

  await replyText(phone, "⏳ Sending your e-Way Bill PDF…");
  try {
    await sendEwayBillPdf(phone, partB.ewbNo, accessToken);
  } catch (pdfErr) {
    logger.error("whatsapp", "PDF send failed", { message: pdfErr.message });
    await replyText(
      phone,
      "Part B was updated, but the PDF could not be sent. Try again from the menu or contact support."
    );
  }

  await sendMainMenu(phone, session.auth.username);
  return session;
}

function parseMode(input) {
  const key = normalizeLower(input);
  return MODE_MAP[key] || MODE_MAP[normalize(input)] || null;
}

function isMenuPartB(input) {
  const k = normalizeLower(input);
  return k === "1" || k === "menu_part_b" || k.includes("part b") || k.includes("partb");
}

function isMenuLogout(input) {
  const k = normalizeLower(input);
  return k === "2" || k === "menu_logout" || k === "logout";
}

function isMenuLogin(input) {
  const k = normalizeLower(input);
  return k === "menu_login" || k === "login";
}

async function handleLogout(phone) {
  deleteSession(phone);
  await replyText(phone, "You are logged out.\n\nSend *hi* or tap *Login* to continue.");
  await sendLoginButton(phone);
}

async function tryAutoLoginAndMenu(phone) {
  const { session, error } = await autoLoginFromRegistry(phone);
  if (session?.auth) {
    session.state = STATES.MENU;
    session.draft.partB = {};
    saveSession(phone, session);
    await replyText(phone, `Welcome back, *${session.auth.username}*!`);
    await sendMainMenu(phone, session.auth.username);
    return { ok: true };
  }

  return { ok: false, error };
}

async function replyAutoLoginFailure(phone, error) {
  if (findOnboardedUser(phone) || error) {
    await replyText(phone, formatEwbAuthFailure(error));
    return true;
  }
  return false;
}

async function startLogin(phone) {
  const result = await tryAutoLoginAndMenu(phone);
  if (result.ok) return;
  if (await replyAutoLoginFailure(phone, result.error)) return;

  const session = resetToLogin(createEmptySession());
  saveSession(phone, session);
  await replyText(phone, welcomeMessage());
}

async function tryRestoreLoggedInSession(phone, session) {
  if (!hasLoggedInAuth(session)) return null;

  try {
    return await ensureWhatsAppEwbToken(phone);
  } catch (err) {
    logger.warn("whatsapp", "Session restore failed", { phone, message: err.message });
    return null;
  }
}

async function handleGreeting(phone, session) {
  const restored = await tryRestoreLoggedInSession(phone, session);
  if (restored?.auth) {
    restored.state = STATES.MENU;
    restored.draft.partB = {};
    saveSession(phone, restored);
    await replyText(phone, `Welcome back, *${restored.auth.username}*!`);
    await sendMainMenu(phone, restored.auth.username);
    return;
  }

  const autoLogin = await tryAutoLoginAndMenu(phone);
  if (autoLogin.ok) return;
  if (await replyAutoLoginFailure(phone, autoLogin.error)) return;

  if (session?.auth) {
    await handleLogout(phone);
    return;
  }

  session = resetToLogin(session || createEmptySession());
  saveSession(phone, session);
  await replyText(phone, welcomeMessage());
}

export async function handleIncomingMessage(phone, messageText) {
  phone = normalizePhone(phone);
  const text = normalize(messageText);
  const lower = normalizeLower(messageText);

  logger.info("whatsapp", "handleIncomingMessage", { phone, text });

  if (!text) {
    logger.warn("whatsapp", "Empty message ignored", { phone });
    return;
  }

  let session = getSession(phone);

  if (["hi", "hello", "hey", "start", "help"].includes(lower)) {
    await handleGreeting(phone, session);
    return;
  }

  if (isMenuLogin(text)) {
    await startLogin(phone);
    return;
  }

  if (isMenuLogout(text)) {
    await handleLogout(phone);
    return;
  }

  if (!session) {
    const autoLogin = await tryAutoLoginAndMenu(phone);
    if (autoLogin.ok) return;
    if (await replyAutoLoginFailure(phone, autoLogin.error)) return;

    session = resetToLogin(createEmptySession());
    saveSession(phone, session);
    await replyText(phone, welcomeMessage());
    return;
  }

  if (session.auth && lower === "menu") {
    try {
      session = (await ensureWhatsAppEwbToken(phone)) || session;
    } catch (err) {
      logger.warn("whatsapp", "Token refresh on menu failed", { message: err.message });
    }
    session.state = STATES.MENU;
    session.draft.partB = {};
    saveSession(phone, session);
    await sendMainMenu(phone, session.auth.username);
    return;
  }

  if (session.auth) {
    try {
      session = (await ensureWhatsAppEwbToken(phone)) || session;
    } catch (err) {
      logger.warn("whatsapp", "Token refresh failed", { phone, message: err.message });
      await replyText(
        phone,
        "Could not refresh your session. Tap *Logout* and log in again if actions fail."
      );
    }
  }

  if (session.auth && session.state.startsWith("LOGIN_")) {
    session.state = STATES.MENU;
    saveSession(phone, session);
  }

  try {
    switch (session.state) {
      case STATES.LOGIN_USERNAME:
        session.draft.login.username = text;
        session.state = STATES.LOGIN_PASSWORD;
        saveSession(phone, session);
        await replyText(phone, "Enter your *Password*:");
        break;

      case STATES.LOGIN_PASSWORD:
        session.draft.login.password = text;
        session.state = STATES.LOGIN_GSTIN;
        saveSession(phone, session);
        await replyText(phone, "Enter your *GSTIN* (15 characters):");
        break;

      case STATES.LOGIN_GSTIN: {
        const gstin = text.toUpperCase();
        if (!validateGstin(gstin)) {
          await replyText(phone, "Invalid GSTIN format. Enter a valid 15-character GSTIN:");
          break;
        }
        await replyText(phone, "⏳ Logging in…");
        try {
          const credentials = {
            username: session.draft.login.username,
            password: session.draft.login.password,
            gstin,
          };
          const { session: loggedIn, auth } = await completeWhatsAppLogin(phone, credentials);

          try {
            await savePhoneMapping(phone, credentials);
          } catch (saveErr) {
            logger.error("whatsapp", "MongoDB save failed after login", {
              phone,
              message: saveErr.message,
            });
            deleteSession(phone);
            if (saveErr.status === 503) {
              await replyText(
                phone,
                "❌ Database is not connected. Set MONGODB_URI in server .env and restart, then log in again."
              );
            } else {
              await replyText(
                phone,
                `❌ Could not save your details: ${saveErr.message}\n\nPlease try again or contact support.`
              );
            }
            break;
          }

          session = loggedIn;
          const account = await getAccountForPhone(phone);
          const phoneCount = account?.phones?.length ?? 1;
          await replyText(
            phone,
            phoneCount > 1
              ? `✅ Login successful.\n\nSaved on this device (${phoneCount} phones on this account).\nLogout ends the session — send *hi* to continue.`
              : "✅ Login successful.\n\nSaved on this device. Logout ends the session — send *hi* to continue."
          );
          await sendMainMenu(phone, auth.username);
        } catch (err) {
          logger.warn("whatsapp", "Login failed", { phone, message: err.message });
          session = resetToLogin(session);
          saveSession(phone, session);
          if (err.status === 400) {
            await replyText(phone, `❌ ${err.message}\n\n${welcomeMessage()}`);
          } else if (err.status === 503) {
            await replyText(
              phone,
              "❌ Server database is not available. Please try again later or contact support."
            );
          } else {
            await replyText(phone, loginFailedMessage());
          }
        }
        break;
      }

      case STATES.MENU:
        if (isMenuPartB(text)) {
          session.state = STATES.PART_B_EWB;
          session.draft.partB = {};
          saveSession(phone, session);
          await replyText(
            phone,
            `Enter *E-Way Bill number* (${EWB_NUMBER_LENGTH} digits, numbers only):`
          );
        } else if (isMenuLogout(text)) {
          await handleLogout(phone);
        } else {
          await sendMainMenu(phone, session.auth.username);
        }
        break;

      case STATES.PART_B_EWB: {
        const parsed = parseEwbInput(text);
        if (parsed.error) {
          await replyText(phone, `❌ ${parsed.error}`);
          break;
        }

        await replyText(phone, "⏳ Verifying e-Way Bill number…");
        try {
          session = (await ensureWhatsAppEwbToken(phone)) || session;
          await verifyEwayBillNumber(parsed.digits, session.auth.access_token);
        } catch (err) {
          const msg =
            err.code === "EWB_NOT_FOUND" || err.message === EWB_INCORRECT_MESSAGE
              ? EWB_INCORRECT_MESSAGE
              : err.message;
          await replyText(phone, `❌ ${msg}`);
          break;
        }

        session.draft.partB.ewbNo = parsed.digits;
        session.state = STATES.PART_B_MODE;
        saveSession(phone, session);
        await sendModeMenu(phone);
        break;
      }

      case STATES.PART_B_MODE: {
        const mode = parseMode(text);
        if (!mode) {
          await sendModeMenu(phone);
          break;
        }
        session.draft.partB.transMode = mode;
        if (isRoadMode(mode)) {
          session.state = STATES.PART_B_VEHICLE;
          saveSession(phone, session);
          await replyText(phone, "Enter *Vehicle number* (e.g. KA01JK9287):");
        } else {
          session.state = STATES.PART_B_PLACE;
          saveSession(phone, session);
          await replyText(phone, "Enter *Place of change*:");
        }
        break;
      }

      case STATES.PART_B_VEHICLE:
        if (text.length < 7) {
          await replyText(phone, "Vehicle number must be 7–15 characters. Try again:");
          break;
        }
        session.draft.partB.vehicleNo = text.toUpperCase();
        session.state = STATES.PART_B_PLACE;
        saveSession(phone, session);
        await replyText(phone, "Enter *Place of change*:");
        break;

      case STATES.PART_B_PLACE:
        session.draft.partB.fromPlace = text;
        if (requiresTransDocNo(session.draft.partB.transMode)) {
          session.state = STATES.PART_B_TRANSDOC;
          saveSession(phone, session);
          await replyText(
            phone,
            "Enter *Transport document number* (e.g. RR123456789 for Rail):"
          );
        } else {
          saveSession(phone, session);
          session = await executePartBUpdate(phone, session);
        }
        break;

      case STATES.PART_B_TRANSDOC:
        if (text.length < 1 || text.length > 15) {
          await replyText(phone, "Transport document number must be 1–15 characters. Try again:");
          break;
        }
        session.draft.partB.transDocNo = text.toUpperCase();
        saveSession(phone, session);
        session = await executePartBUpdate(phone, session);
        break;

      case STATES.PART_B_REASON:
        saveSession(phone, session);
        session = await executePartBUpdate(phone, session);
        break;

      default:
        if (session.auth) {
          session.state = STATES.MENU;
          saveSession(phone, session);
          await sendMainMenu(phone, session.auth.username);
        } else {
          session = resetToLogin(session);
          saveSession(phone, session);
          await replyText(phone, welcomeMessage());
        }
    }
  } catch (err) {
    logger.error("whatsapp", "Conversation error", { phone, message: err.message });

    if (session?.state === STATES.LOGIN_GSTIN && isLoginError(err)) {
      session = resetToLogin(session);
      saveSession(phone, session);
      await replyText(phone, loginFailedMessage());
      return;
    }

    if (session?.auth) {
      await replyText(phone, `❌ ${err.message}\n\nUse the menu below to continue.`);
      session.state = STATES.MENU;
      saveSession(phone, session);
      await sendMainMenu(phone, session.auth.username);
    } else {
      session = resetToLogin(session);
      saveSession(phone, session);
      await replyText(phone, loginFailedMessage());
    }
  }
}
