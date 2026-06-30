import Preferences from "../models/preferences.model.js";

/**
 * Get preferences for the authenticated user.
 * Auto-creates default preferences if not found.
 */
export const getPreferencesController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        let preferences = await Preferences.findOne({ userId });
        if (!preferences) {
            preferences = await Preferences.create({ userId });
        }

        res.status(200).json({
            status: 'success',
            message: 'Preferences fetched successfully',
            preferences
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Update preferences for the authenticated user.
 * Merges updates using dot notation to prevent overwriting nested fields.
 */
export const updatePreferencesController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        const updateData = {};
        const { theme, editor, copilot, notifications } = req.body;

        if (theme !== undefined) updateData['theme'] = theme;

        if (editor) {
            if (editor.fontSize !== undefined) updateData['editor.fontSize'] = editor.fontSize;
            if (editor.tabSize !== undefined) updateData['editor.tabSize'] = editor.tabSize;
            if (editor.autoSave !== undefined) updateData['editor.autoSave'] = editor.autoSave;
            if (editor.minimap !== undefined) updateData['editor.minimap'] = editor.minimap;
            if (editor.wordWrap !== undefined) updateData['editor.wordWrap'] = editor.wordWrap;
        }

        if (copilot) {
            if (copilot.modelPreference !== undefined) updateData['copilot.modelPreference'] = copilot.modelPreference;
            if (copilot.autoSuggest !== undefined) updateData['copilot.autoSuggest'] = copilot.autoSuggest;
            if (copilot.interactiveMode !== undefined) updateData['copilot.interactiveMode'] = copilot.interactiveMode;
        }

        if (notifications) {
            if (notifications.emailLogins !== undefined) updateData['notifications.emailLogins'] = notifications.emailLogins;
            if (notifications.securityAlerts !== undefined) updateData['notifications.securityAlerts'] = notifications.securityAlerts;
        }

        const preferences = await Preferences.findOneAndUpdate(
            { userId },
            { $set: updateData },
            { new: true, runValidators: true, upsert: true }
        );

        res.status(200).json({
            status: 'success',
            message: 'Preferences updated successfully',
            preferences
        });
    } catch (err) {
        next(err);
    }
};
