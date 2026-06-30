import Profile from "../models/profile.model.js";

/**
 * Get profile for the authenticated user.
 * Auto-creates a default profile if not found.
 */
export const getProfileController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        let profile = await Profile.findOne({ userId });
        if (!profile) {
            profile = await Profile.create({ userId });
        }

        res.status(200).json({
            status: 'success',
            message: 'Profile fetched successfully',
            profile
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Update profile for the authenticated user.
 */
export const updateProfileController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        const updateData = { ...req.body };
        // Do not allow updating the userId manually
        delete updateData.userId;

        const profile = await Profile.findOneAndUpdate(
            { userId },
            { $set: updateData },
            { new: true, runValidators: true, upsert: true }
        );

        res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully',
            profile
        });
    } catch (err) {
        next(err);
    }
};
