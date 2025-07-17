import { Request, Response } from "express";
import { adminSupabase, supabase } from "../config/supabaseClient.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export const register = async (req: Request, res: Response) => {
  const { email, password, name, phone } = req.body;

  // Validation
  if (!email || !password || !name) {
    return res.status(400).json({
      error: "Email, password, and name are required",
      received: { email: !!email, password: !!password, name: !!name },
    });
  }

  try {
    // Step 1: Create the auth user with user metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name.trim(),
          phone: phone?.trim() || null,
        },
      },
    });

    if (authError) {
      console.error("Auth signup error:", authError);
      return res.status(400).json({ error: authError.message });
    }

    // That's it! No profile creation here - the database trigger will handle it
    // when the user confirms their email

    res.status(201).json({
      user: authData.user,
      message:
        "User registered successfully. Please check your email to confirm your account.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      // Still return the auth data even if profile fetch fails
      return res.json({
        user: authData.user,
        session: authData.session,
        profile: null,
      });
    }

    res.json({
      user: authData.user,
      session: authData.session,
      profile: profileData,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ profile: data });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Delete user from Supabase Auth (admin privilege required)
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(
      userId
    );
    if (deleteError) {
      return res.status(400).json({ error: deleteError.message });
    }

    // Optionally, delete user profile from 'profiles' table
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileError) {
      // Log but don't block response
      console.error("Profile deletion error:", profileError);
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getClientData = async (req: Request, res: Response) => {
  try {
    const clientSlug = req.params.slug;

    if (!clientSlug) {
      return res.status(401).json({ error: "No client sulg provided!" });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("user_name", clientSlug)
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json({ profile: data });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
