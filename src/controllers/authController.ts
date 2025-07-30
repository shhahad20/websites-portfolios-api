import { Request, Response } from "express";
import { adminSupabase, supabase } from "../config/supabaseClient.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import dotenv from "dotenv";
dotenv.config();

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
        // emailRedirectTo: `${process.env.BACKEND_URL}/auth/confirmed-email`,
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
export const confirmedEmail = async (req: Request, res: Response) => {
  return res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Email Confirmed</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 4rem; }
          h1 { color: #6d5bba; }
          a { color: #6d5bba; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>✅ Your email is confirmed!</h1>
        <p>Thanks for verifying your address.</p>
        <p><a href="${process.env.FRONTEND_URL}">Return to home page</a></p>
      </body>
    </html>
  `);
};
export const confirmEmail = async (req: Request, res: Response) => {
  const email = (req.query.email as string) ?? ''
  const token = (req.query.token as string) || (req.query.token_hash as string);
 if (!email || !token) {
    return res
      .status(400)
      .send(`
        <h1>Invalid Confirmation Link</h1>
        <p>Missing ${!email ? 'email' : 'token'} in the URL.</p>
      `)
  }

  // Flip email_confirmed_at in the DB
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error) {
    console.error("Verification error", error);
    return res.status(400).send(`
        <html>
          <body>
            <h1>Email Confirmation Failed</h1>
            <p>${error.message}</p>
          </body>
        </html>
      `);
  }

  // Success!
  return res.status(200).send(`
      <html>
        <body>
          <h1>Email Confirmed</h1>
          <p>Your email has been successfully confirmed. You can now <a href="/auth/login">log in</a>.</p>
        </body>
      </html>
    `);
};
export const authCallback = async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error("Auth callback error:", error, error_description);
    return res.status(400).send(`
      <html>
        <body>
          <h1>Email Confirmation Failed</h1>
          <p>${error_description || 'Error confirming user'}</p>
          <a href="/auth/login">Try logging in</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <html>
        <body>
          <h1>Invalid Confirmation Link</h1>
          <p>Missing authorization code.</p>
        </body>
      </html>
    `);
  }

  try {
    // Exchange the code for a session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code as string);
    
    if (exchangeError) {
      console.error("Code exchange error:", exchangeError);
      return res.status(400).send(`
        <html>
          <body>
            <h1>Email Confirmation Failed</h1>
            <p>${exchangeError.message}</p>
          </body>
        </html>
      `);
    }

    // Success! User is now confirmed
    // Set session cookies if you're using cookie-based auth
    if (data.session) {
      // Set httpOnly cookies for the session
      res.cookie('sb-access-token', data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: data.session.expires_in * 1000
      });
      
      res.cookie('sb-refresh-token', data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
    }

    // Redirect to success page or dashboard
    return res.redirect('/dashboard'); // or wherever you want users to go
    
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).send(`
      <html>
        <body>
          <h1>Email Confirmation Failed</h1>
          <p>An unexpected error occurred. Please try again.</p>
        </body>
      </html>
    `);
  }
};