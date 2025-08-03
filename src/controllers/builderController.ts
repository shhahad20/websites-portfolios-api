import { Response } from "express";
import { adminSupabase, supabase } from "../config/supabaseClient.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export interface BuilderSettings {
  primary_color: string;
  bg_type: "solid" | "gradient";
  bg_color: string;
  gradient_from?: string;
  gradient_to?: string;
  gradient_direction?: string;
  input_color: string;
  border_color: string;
  social_btn_color: string;
  avatar_url?: string;
  prompts: string[];
  socials: Array<{
    label: string;
    href: string;
    icon: string;
  }>;
}

// Get user's builder settings
export const getBuilderSettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id; // Assuming you have user info from auth middleware

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("builder_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found"
      console.error("Error fetching builder settings:", error);
      return res.status(500).json({ error: "Failed to fetch settings" });
    }

    // Return default settings if no settings found
    if (!data) {
      const defaultSettings = {
        primary_color: "#3b82f6",
        bg_type: "solid" as const,
        bg_color: "#ffffff",
        gradient_from: "#3b82f6",
        gradient_to: "#8b5cf6",
        gradient_direction: "to bottom",
        input_color: "#ffffff",
        border_color: "#d1d5db",
        social_btn_color: "#3b82f6",
        avatar_url: null,
        prompts: [],
        socials: [],
      };
      return res.json(defaultSettings);
    }

    res.json(data);
  } catch (error) {
    console.error("Error in getBuilderSettings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create or update builder settings
export const saveBuilderSettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const settings: BuilderSettings = req.body;

    // Validate required fields
    if (!settings.primary_color || !settings.bg_type || !settings.bg_color) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if settings already exist for this user
    const { data: existingSettings } = await adminSupabase
      .from("builder_settings")
      .select("id")
      .eq("user_id", userId)
      .single();

    let result;

    if (existingSettings) {
      // Update existing settings
      const { data, error } = await adminSupabase
        .from("builder_settings")
        .update({
          primary_color: settings.primary_color,
          bg_type: settings.bg_type,
          bg_color: settings.bg_color,
          gradient_from: settings.gradient_from,
          gradient_to: settings.gradient_to,
          gradient_direction: settings.gradient_direction,
          input_color: settings.input_color,
          border_color: settings.border_color,
          social_btn_color: settings.social_btn_color,
          avatar_url: settings.avatar_url,
          prompts: settings.prompts,
          socials: settings.socials,
        })
        .eq("user_id", userId)
        .select()
        .single();

      result = { data, error };
    } else {
      // Create new settings
      const { data, error } = await adminSupabase
        .from("builder_settings")
        .insert({
          user_id: userId,
          primary_color: settings.primary_color,
          bg_type: settings.bg_type,
          bg_color: settings.bg_color,
          gradient_from: settings.gradient_from,
          gradient_to: settings.gradient_to,
          gradient_direction: settings.gradient_direction,
          input_color: settings.input_color,
          border_color: settings.border_color,
          social_btn_color: settings.social_btn_color,
          avatar_url: settings.avatar_url,
          prompts: settings.prompts,
          socials: settings.socials,
        })
        .select()
        .single();

      result = { data, error };
    }

    if (result.error) {
      console.error("Error saving builder settings:", result.error);
      return res.status(500).json({ error: "Failed to save settings" });
    }

    res.json({
      message: "Settings saved successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("Error in saveBuilderSettings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete builder settings
export const deleteBuilderSettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { error } = await supabase
      .from("builder_settings")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting builder settings:", error);
      return res.status(500).json({ error: "Failed to delete settings" });
    }

    res.json({ message: "Settings deleted successfully" });
  } catch (error) {
    console.error("Error in deleteBuilderSettings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Upload avatar image
export const uploadAvatar = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch existing avatar_url from your settings table
    const { data: existing, error: fetchErr } = await adminSupabase
      .from("builder_settings")
      .select("avatar_url")
      .eq("user_id", userId)
      .single();
    if (fetchErr && fetchErr.code !== "PGRST116") {
      console.error("Fetch existing avatar:", fetchErr);
    }

    // 2) If there is an old avatar, delete it
    if (existing?.avatar_url) {
      // extract path after `/uploads/`
      const path = existing.avatar_url.split("/uploads/")[1];
      if (path) {
        await adminSupabase.storage.from("uploads").remove([path]);
      }
    }

    // 3) Now handle the new upload
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileExt = req.file.originalname.split(".").pop();
    const fileName = `avatar_${userId}.${fileExt}`; // fixed per-user name

    const { error: uploadErr } = await adminSupabase.storage
      .from("uploads")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (uploadErr) {
      console.error("Error uploading avatar:", uploadErr);
      return res.status(500).json({ error: "Failed to upload avatar" });
    }

    // 4) Get public URL and update the settings row
    const {
      data: { publicUrl },
    } = adminSupabase.storage.from("uploads").getPublicUrl(fileName);

    await adminSupabase
      .from("builder_settings")
      .update({ avatar_url: publicUrl })
      .eq("user_id", userId);

    res.json({ message: "Avatar replaced successfully", url: publicUrl });
  } catch (error) {
    console.error("Error in uploadAvatar:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
