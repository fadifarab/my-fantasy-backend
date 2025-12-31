// server/services/fplService.js
const axios = require('axios');

const FPL_API_URL = 'https://fantasy.premierleague.com/api';

// جلب البيانات العامة للمستخدم
const getUserFPLData = async (fplId) => {
  try {
    const response = await axios.get(`${FPL_API_URL}/entry/${fplId}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    throw new Error('فشل جلب بيانات FPL. تأكد من المعرف (ID) الصحيح.');
  }
};

// جلب نقاط جولة محددة (Pick)
const getUserFPLPoints = async (fplId, gw) => {
  try {
    const response = await axios.get(`${FPL_API_URL}/entry/${fplId}/event/${gw}/picks/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return {
      gwPoints: response.data.entry_history.points,
      eventTransfersCost: response.data.entry_history.event_transfers_cost
    };
  } catch (error) {
    console.error(`Error fetching points for user ${fplId} GW ${gw}`);
    return null;
  }
};

// جلب حالة الجولة الحالية
const getCurrentGameweekStatus = async () => {
    try {
        const response = await axios.get(`${FPL_API_URL}/bootstrap-static/`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const currentEvent = response.data.events.find(event => event.is_current);
        return currentEvent || response.data.events.find(event => event.is_next);
    } catch (error) {
        console.error("Error fetching bootstrap-static");
        return null;
    }
};

// التحقق من صحة الفريق
const validateUserTeam = async (fplId) => {
    try {
        const data = await getUserFPLData(fplId);
        return {
            isValid: true,
            teamName: data.name,
            managerName: `${data.player_first_name} ${data.player_last_name}`
        };
    } catch (error) {
        return { isValid: false };
    }
};

// 🆕 دالة جديدة: جلب التاريخ الكامل للاعب (تسريع المزامنة)
const getUserHistory = async (fplId) => {
  try {
    const response = await axios.get(`${FPL_API_URL}/entry/${fplId}/history/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching history for ${fplId}:`, error.message);
    return null;
  }
};

module.exports = {
  getUserFPLData,
  getUserFPLPoints,
  getCurrentGameweekStatus,
  validateUserTeam,
  getUserHistory // ✅ تم التصدير
};