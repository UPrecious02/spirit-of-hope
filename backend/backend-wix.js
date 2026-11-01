import wixData from 'wix-data';
import { fetch } from 'wix-fetch';

export async function saveAssessment(assessmentData) {
    try {
        const result = await wixData.insert('AssessmentSubmissions', {
            name: assessmentData.name,
            email: assessmentData.email,
            phone: assessmentData.phone || '',
            relationship: assessmentData.relationship || '',
            score: parseInt(assessmentData.score),
            riskLevel: assessmentData.riskLevel,
            answers: assessmentData.answers,
            submittedDate: new Date(assessmentData.submittedDate)
        });

        console.log('✅ Backend saved! ID:', result._id);

        // Fire Klaviyo event for each recipient
        const recipients = [
            'tatianalialo@spiritofhopeagency.com',
            'triumphbusiness08@gmail.com'
        ];

        for (const emailAddress of recipients) {
            const response = await fetch('https://a.klaviyo.com/api/events/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Klaviyo-API-Key pk_VgvH6P_d7edbd7c818be06667b2f22ee512ea58fd`,
                    'revision': '2024-02-15'
                },
                body: JSON.stringify({
                    data: {
                        type: 'event',
                        attributes: {
                            metric: {
                                data: {
                                    type: 'metric',
                                    attributes: { name: 'Assessment Submitted' }
                                }
                            },
                            profile: {
                                data: {
                                    type: 'profile',
                                    attributes: { email: emailAddress }
                                }
                            },
                            properties: {
                                name: assessmentData.name,
                                email: assessmentData.email,
                                phone: assessmentData.phone || 'N/A',
                                relationship: assessmentData.relationship || 'N/A',
                                score: String(assessmentData.score),
                                risk_level: assessmentData.riskLevel,
                                submitted_date: assessmentData.submittedDate
                            }
                        }
                    }
                })
            });

            const responseText = await response.text();
            console.log(`📧 Klaviyo event for ${emailAddress}:`, response.status, responseText);
        }

        return { success: true, id: result._id };
    } catch (error) {
        console.error('❌ Backend error:', error);
        return { success: false, error: error.message };
    }
}